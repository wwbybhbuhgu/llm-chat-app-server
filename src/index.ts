/**
 * AI Chat Application - Production Version
 * 
 * Features:
 * - JWT Authentication
 * - Rate Limiting  
 * - Input Validation (Zod)
 * - Structured Logging
 * - D1 Database Persistence
 * - Streaming AI Responses
 */

import { Env, ChatMessage, Contact, ConversationRecord } from "./types";
import { config } from "./config";
import { validate, loginUserSchema, createContactSchema, chatMessageSchema, historyQuerySchema } from "./validation";
import { generateJWT, decodeJWT, extractSessionId, getRateLimitKey } from "./auth";
import { hashPassword, verifyPassword } from "./password";
import logger from "./logger";

// Model configuration
const MODEL_ID = config.workersAI.model;

// Session storage (In production, use Redis/Durable Objects)
interface Session {
	userId: number;
	username: string;
	createdAt: number;
}

const sessions = new Map<string, Session>();

// ==================== Middleware Helpers ====================

async function checkAuth(env: Env, headers: Headers): Promise<{ valid: boolean; sessionId?: string; payload?: any }> {
	const sessionId = extractSessionId(headers);
	
	if (!sessionId) {
		logger.debug("No session ID provided", undefined, "auth");
		return { valid: false };
	}

	if (!sessions.has(sessionId)) {
		logger.warn("Invalid session ID", { sessionId }, "auth");
		return { valid: false };
	}

	const session = sessions.get(sessionId)!;

	// Check expiration
	if (Date.now() > session.createdAt + config.security.sessionExpiryHours * 60 * 60 * 1000) {
		sessions.delete(sessionId);
		logger.warn("Session expired", { sessionId }, "auth");
		return { valid: false };
	}

	return { valid: true, sessionId, payload: session };
}

async function checkRateLimit(caches: CacheStorage, key: string): Promise<boolean> {
	try {
		const cache = await caches.open("rate-limit");
		const response = await cache.match(key);
		
		if (response && response.ok) {
			const data = await response.json();
			if (data.count >= config.rateLimit.maxRequests) {
				logger.warn("Rate limit exceeded", { key, count: data.count }, "ratelimit");
				return false;
			}
			
			// Increment counter
			data.count += 1;
			data.lastRequest = Date.now();
			await cache.put(key, new Response(JSON.stringify(data), {
				headers: { "Cache-Control": `max-age=${config.rateLimit.windowMs / 1000}` }
			}));
			return true;
		}

		// Initialize counter
		const initialData = { count: 1, lastRequest: Date.now() };
		await cache.put(key, new Response(JSON.stringify(initialData), {
			headers: { "Cache-Control": `max-age=${config.rateLimit.windowMs / 1000}` }
		}));
		return true;
	} catch (error) {
		logger.error(`Rate limiting failed: ${error}`, { key }, "ratelimit");
		return true; // Fail open
	}
}

// ==================== API Handlers ====================

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Handle static assets
		if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		// Route handling
		try {
			switch (url.pathname) {
				case "/api/chat":
					return request.method === "POST" 
						? handleChatRequest(request, env, ctx)
						: jsonError({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, 405);

				case "/api/contacts":
					return request.method === "GET"
						? handleGetContacts(env)
						: request.method === "POST"
							? handleCreateContact(request, env, ctx)
							: jsonError({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, 405);

				case "/api/history":
					return request.method === "GET"
						? handleGetHistory(request, env)
						: jsonError({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, 405);

				case "/api/login":
					return request.method === "POST"
						? handleLogin(request, env, ctx)
						: jsonError({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, 405);

				case "/api/auth/check":
					return handleAuthCheck(request);

				default:
					return jsonError({ error: "Not found", code: "NOT_FOUND" }, 404);
			}
		} catch (error) {
			logger.error("Unhandled error", { error: String(error) }, "api");
			return jsonError({ error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
		}
	},
} satisfies ExportedHandler<Env>;

// ==================== Error Helper ====================

function jsonError(error: { error: string; code?: string; message?: string }, status: number): Response {
	return new Response(JSON.stringify(error), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

// ==================== Chat Handler ====================

async function handleChatRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	try {
		// Rate limit
		const ip = request.headers.get("X-Forwarded-For") || "unknown";
		const rateKey = getRateLimitKey(ip);
		const caches = await caches.open("main");
		if (!(await checkRateLimit(caches, `${rateKey}:chat`))) {
			return jsonError({ error: "Rate limit exceeded", code: "RATE_LIMIT_EXCEEDED" }, 429);
		}

		// Auth check
		const auth = await checkAuth(env, request.headers);
		if (!auth.valid) {
			return jsonError({ error: "Authentication required", code: "UNAUTHORIZED" }, 401);
		}

		// Parse and validate
		const body = await request.json();
		const validation = validate(chatMessageSchema, {
			...body,
			sessionId: auth.sessionId
		});

		if (!validation.valid) {
			return jsonError({ 
				error: "Validation failed", 
				code: "VALIDATION_ERROR",
				message: validation.errors?.join(", ")
			}, 400);
		}

		const { messages, contactId } = validation.data;

		// Fetch persona
		const contactResult = await env.DB.prepare(
			"SELECT persona FROM contacts WHERE id = ?"
		).bind(contactId).first<{ persona: string }>();

		if (!contactResult) {
			return jsonError({ error: "Contact not found", code: "CONTACT_NOT_FOUND" }, 404);
		}

		// Build prompt
		const systemPrompt = `${contactResult.persona}\n\n当前对话正在进行中，请根据前面的对话内容继续回复。`;
		let formattedMessages = [
			{ role: "system", content: systemPrompt },
			...messages.filter(m => m.role !== "system").slice(-20)
		];

		// Generate response
		const stream = await env.AI.run(MODEL_ID, {
			messages: formattedMessages,
			max_tokens: 512,
			stream: true,
		});

		// Save user message
		ctx.waitUntil(saveConversation(env, contactId, messages[messages.length - 1].content, ""));

		return new Response(stream, {
			headers: {
				"Content-Type": "text/event-stream; charset=utf-8",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			},
		});
	} catch (error) {
		logger.error("Chat request failed", { error: String(error) }, "chat");
		return jsonError({ error: "Failed to process request", code: "CHAT_ERROR" }, 500);
	}
}

// ==================== Contacts Handlers ====================

async function handleGetContacts(env: Env): Promise<Response> {
	try {
		const results = await env.DB.prepare(
			"SELECT id, name, initials, avatar_color, last_message, timestamp FROM contacts ORDER BY updated_at DESC"
		).all<Contact[]>();

		return jsonSuccess(results.results);
	} catch (error) {
		logger.error("Failed to fetch contacts", { error: String(error) }, "contacts");
		return jsonError({ error: "Failed to fetch contacts", code: "DB_ERROR" }, 500);
	}
}

async function handleCreateContact(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	try {
		// Rate limit
		const ip = request.headers.get("X-Forwarded-For") || "unknown";
		const caches = await caches.open("main");
		if (!(await checkRateLimit(caches, `${getRateLimitKey(ip)}:create_contact`))) {
			return jsonError({ error: "Rate limit exceeded", code: "RATE_LIMIT_EXCEEDED" }, 429);
		}

		// Auth check
		const auth = await checkAuth(env, request.headers);
		if (!auth.valid) {
			return jsonError({ error: "Authentication required", code: "UNAUTHORIZED" }, 401);
		}

		// Parse and validate
		const body = await request.json();
		const validation = validate(createContactSchema, { ...body, sessionId: auth.sessionId });

		if (!validation.valid) {
			return jsonError({ 
				error: "Validation failed", 
				code: "VALIDATION_ERROR",
				message: validation.errors?.join(", ")
			}, 400);
		}

		const { name, initials, persona, avatarColor } = validation.data;

		// Insert
		const result = await env.DB.prepare(`
			INSERT INTO contacts (name, initials, persona, avatar_color, status)
			VALUES (?, ?, ?, ?, 'online')
		`).bind(name, initials, persona, avatarColor).run();

		logger.info("Contact created", { name, userId: auth.payload?.userId }, "contacts");

		return jsonSuccess({
			success: true,
			id: Number(result.meta.last_row_id),
			name,
			initials,
			avatarColor
		});
	} catch (error) {
		logger.error("Failed to create contact", { error: String(error) }, "contacts");
		return jsonError({ error: "Failed to create contact", code: "DB_ERROR" }, 500);
	}
}

// ==================== History Handler ====================

async function handleGetHistory(request: Request, env: Env): Promise<Response> {
	try {
		const url = new URL(request.url);
		const queryValidation = validate(historyQuerySchema, {
			contactId: parseInt(url.searchParams.get("contactId") || "0"),
			limit: parseInt(url.searchParams.get("limit") || "50"),
		});

		if (!queryValidation.valid) {
			return jsonError({ 
				error: "Invalid query parameters", 
				code: "VALIDATION_ERROR",
				message: queryValidation.errors?.join(", ")
			}, 400);
		}

		const { contactId, limit } = queryValidation.data;

		const results = await env.DB.prepare(`
			SELECT user_message, ai_reply, timestamp 
			FROM conversations 
			WHERE contact_id = ? 
			ORDER BY timestamp ASC 
			LIMIT ?
		`).bind(contactId, limit).all<ConversationRecord[]>();

		return jsonSuccess(results.results);
	} catch (error) {
		logger.error("Failed to fetch history", { error: String(error) }, "history");
		return jsonError({ error: "Failed to fetch history", code: "DB_ERROR" }, 500);
	}
}

// ==================== Login Handler ====================

async function handleLogin(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	try {
		// Rate limit
		const ip = request.headers.get("X-Forwarded-For") || "unknown";
		const caches = await caches.open("main");
		if (!(await checkRateLimit(caches, `${getRateLimitKey(ip)}:login`))) {
			return jsonError({ error: "Rate limit exceeded", code: "RATE_LIMIT_EXCEEDED" }, 429);
		}

		// Parse and validate
		const body = await request.json();
		const validation = validate(loginUserSchema, body);

		if (!validation.valid) {
			return jsonError({ 
				error: "Invalid credentials", 
				code: "VALIDATION_ERROR",
				message: validation.errors?.join(", ")
			}, 400);
		}

		const { username, password } = validation.data;

		// Hash password
		const hashedPassword = await hashPassword(password);

		// Check user
		const userResult = await env.DB.prepare(`
			SELECT id, username, password_hash FROM users WHERE username = ?
		`).bind(username).first();

		if (!userResult) {
			logger.warn("Login attempt with invalid username", { username }, "auth");
			return jsonError({ error: "Invalid credentials", code: "INVALID_CREDENTIALS" }, 401);
		}

		if (userResult.password_hash !== hashedPassword) {
			logger.warn("Login attempt with incorrect password", { username }, "auth");
			return jsonError({ error: "Invalid credentials", code: "INVALID_CREDENTIALS" }, 401);
		}

		// Generate token
		const jwtToken = generateJWT({
			userId: userResult.id,
			username: userResult.username
		});

		logger.info("User logged in", { userId: userResult.id, username: userResult.username }, "auth");

		return new Response(JSON.stringify({
			success: true,
			token: jwtToken,
			user: { id: userResult.id, username: userResult.username }
		}), {
			headers: { 
				"Content-Type": "application/json",
				"Set-Cookie": `jwt=${jwtToken}; Path=/; HttpOnly; SameSite=Strict`
			}
		});
	} catch (error) {
		logger.error("Login failed", { error: String(error) }, "auth");
		return jsonError({ error: "Login failed", code: "LOGIN_ERROR" }, 500);
	}
}

// ==================== Auth Check Handler ====================

function handleAuthCheck(request: Request): Response {
	const cookies = request.headers.get("Cookie");
	const cookieMatch = cookies?.match(/jwt=([^;]+)/);
	const paramToken = new URL(request.url).searchParams.get("token");
	const hasToken = cookieMatch || paramToken;

	if (!hasToken) {
		return jsonSuccess({ authenticated: false });
	}

	// Simple JWT verification (in production, use proper library)
	try {
		const token = cookieMatch?.[1] || paramToken!;
		const decoded = decodeJWT(token);
		
		if (!decoded || !decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
			return jsonSuccess({ authenticated: false });
		}

		return jsonSuccess({ authenticated: true, user: decoded });
	} catch {
		return jsonSuccess({ authenticated: false });
	}
}

// ==================== Helper Functions ====================

function jsonSuccess<T>(data: T): Response {
	return new Response(JSON.stringify({ success: true, data }), {
		headers: { "Content-Type": "application/json" },
	});
}

async function saveConversation(env: Env, contactId: number, userMessage: string, aiReply: string): Promise<void> {
	try {
		const record = {
			id: crypto.randomUUID(),
			contact_id: contactId,
			user_message: userMessage,
			ai_reply: aiReply,
			timestamp: Date.now(),
		};

		await env.DB.prepare(`
			INSERT INTO conversations (id, contact_id, user_message, ai_reply, timestamp)
			VALUES (?, ?, ?, ?, ?)
		`).bind(record.id, record.contact_id, record.user_message, record.ai_reply, record.timestamp).run();

		await env.DB.prepare(`
			UPDATE contacts SET last_message = ?, timestamp = ? WHERE id = ?
		`).bind(userMessage, Date.now(), contactId).run();
	} catch (error) {
		logger.error("Failed to save conversation", { error: String(error) }, "database");
	}
}
