/**
 * LLM Chat Application Template with Multi-Contact Support
 *
 * A chat application using Cloudflare Workers AI with D1 database persistence
 * and personalized personas for each contact.
 */
import { Env, ChatMessage, Contact, ConversationRecord } from "./types";

// Model ID for Workers AI model
const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";

// Default system prompt (fallback)
const DEFAULT_SYSTEM_PROMPT = "You are a helpful, friendly assistant.";

// Session storage (in production, use Redis or similar)
const sessions = new Map<string, { userId: string; expiresAt: number }>();

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Handle static assets (frontend)
		if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		// API Routes
		switch (url.pathname) {
			case "/api/chat":
				if (request.method === "POST") {
					return handleChatRequest(request, env, ctx);
				}
				return new Response("Method not allowed", { status: 405 });

			case "/api/contacts":
				switch (request.method) {
					case "GET":
						return handleGetContacts(env);
					case "POST":
						return handleCreateContact(request, env);
					default:
						return new Response("Method not allowed", { status: 405 });
				}

			case "/api/history":
				if (request.method === "GET") {
					return handleGetHistory(request, env);
				}
				return new Response("Method not allowed", { status: 405 });

			case "/api/login":
				if (request.method === "POST") {
					return handleLogin(request, env);
				}
				return new Response("Method not allowed", { status: 405 });

			case "/api/auth/check":
				return handleAuthCheck(request);

			default:
				return new Response("Not found", { status: 404 });
		}
	},
} satisfies ExportedHandler<Env>;

/**
 * Handles chat API requests with persona-based prompts
 */
async function handleChatRequest(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
): Promise<Response> {
	try {
		const { messages = [], contactId }: { messages: ChatMessage[]; contactId: number } = await request.json();

		// Fetch contact persona from database
		const contactResult = await env.DB.prepare(
			"SELECT persona FROM contacts WHERE id = ?"
		).bind(contactId).first<{ persona: string }>();

		if (!contactResult) {
			return new Response(JSON.stringify({ error: "Contact not found" }), {
				status: 404,
				headers: { "content-type": "application/json" },
			});
		}

		const personaPrompt = contactResult.persona || DEFAULT_SYSTEM_PROMPT;

		// Build the system prompt by combining persona with context
		const systemPrompt = `${personaPrompt}\n\n当前对话正在进行中，请根据前面的对话内容继续回复。`;

		// Add system prompt if not present
		let formattedMessages = [...messages];
		if (!formattedMessages.some((msg) => msg.role === "system")) {
			formattedMessages.unshift({ role: "system", content: systemPrompt });
		}

		// Limit to last 20 messages to avoid token limits
		if (formattedMessages.length > 20) {
			formattedMessages = formattedMessages.slice(-20);
		}

		const stream = await env.AI.run(
			MODEL_ID,
			{
				messages: formattedMessages,
				max_tokens: 512,
				stream: true,
			}
		);

		// Save user message to database asynchronously
		const body = await request.json();
		ctx.waitUntil(saveToDatabase(env, contactId, body.messages[body.messages.length - 1].content, ""));

		return new Response(stream, {
			headers: {
				"content-type": "text/event-stream; charset=utf-8",
				"cache-control": "no-cache",
				connection: "keep-alive",
			},
		});
	} catch (error) {
		console.error("Error processing chat request:", error);
		return new Response(
			JSON.stringify({ error: "Failed to process request" }),
			{ status: 500, headers: { "content-type": "application/json" } }
		);
	}
}

/**
 * Saves conversation to database
 */
async function saveToDatabase(
	env: Env,
	contactId: number,
	userMessage: string,
	aiReply: string
): Promise<void> {
	try {
		const record: ConversationRecord = {
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

		// Update last message in contacts table
		await env.DB.prepare(`
			UPDATE contacts SET last_message = ?, timestamp = ? WHERE id = ?
		`).bind(userMessage, Date.now(), contactId).run();
	} catch (error) {
		console.error("Error saving to database:", error);
	}
}

/**
 * Handles GET /api/contacts
 */
async function handleGetContacts(env: Env): Promise<Response> {
	try {
		const results = await env.DB.prepare(
			"SELECT id, name, initials, status, avatar_color, last_message, timestamp FROM contacts ORDER BY updated_at DESC"
		).all<Contact[]>();

		return new Response(JSON.stringify(results.results), {
			headers: { "content-type": "application/json" },
		});
	} catch (error) {
		console.error("Error fetching contacts:", error);
		return new Response(
			JSON.stringify({ error: "Failed to fetch contacts" }),
			{ status: 500, headers: { "content-type": "application/json" } }
		);
	}
}

/**
 * Handles GET /api/history?contactId=X&limit=50
 */
async function handleGetHistory(request: Request, env: Env): Promise<Response> {
	try {
		const url = new URL(request.url);
		const contactId = parseInt(url.searchParams.get("contactId") || "0");
		const limit = parseInt(url.searchParams.get("limit") || "50");

		const results = await env.DB.prepare(`
			SELECT user_message, ai_reply, timestamp 
			FROM conversations 
			WHERE contact_id = ? 
			ORDER BY timestamp ASC 
			LIMIT ?
		`).bind(contactId, limit).all<ConversationRecord[]>();

		return new Response(JSON.stringify(results.results), {
			headers: { "content-type": "application/json" },
		});
	} catch (error) {
		console.error("Error fetching history:", error);
		return new Response(
			JSON.stringify({ error: "Failed to fetch history" }),
			{ status: 500, headers: { "content-type": "application/json" } }
		);
	}
}

/**
 * Handles POST /api/contacts - Create a new contact
 */
async function handleCreateContact(request: Request, env: Env): Promise<Response> {
	try {
		const body = await request.json();
		const { name, initials, persona, avatarColor } = body;

		if (!name || !initials || !persona) {
			return new Response(
				JSON.stringify({ error: "缺少必要字段：name, initials, persona" }),
				{ status: 400, headers: { "content-type": "application/json" } }
			);
		}

		const result = await env.DB.prepare(`
			INSERT INTO contacts (name, initials, persona, avatar_color, status)
			VALUES (?, ?, ?, ?, 'online')
		`).bind(name, initials, persona, avatarColor || '#6c8cbf').run();

		return new Response(JSON.stringify({
			success: true,
			id: result.meta.last_row_id,
			name,
			initials,
			persona,
			avatarColor: avatarColor || '#6c8cbf'
		}), {
			headers: { "content-type": "application/json" }
		});
	} catch (error) {
		console.error("Error creating contact:", error);
		return new Response(
			JSON.stringify({ error: "Failed to create contact" }),
			{ status: 500, headers: { "content-type": "application/json" } }
		);
	}
}

/**
 * Handles POST /api/login - User login with password hashing
 */
async function handleLogin(request: Request, env: Env): Promise<Response> {
	try {
		const { username, password } = await request.json();

		if (!username || !password) {
			return new Response(
				JSON.stringify({ error: "用户名和密码不能为空" }),
				{ status: 400, headers: { "content-type": "application/json" } }
			);
		}

		// Hash the password using Web Crypto API
		const encoder = new TextEncoder();
		const data = encoder.encode(password);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const hashedPassword = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

		// Check if user exists in database
		const userResult = await env.DB.prepare(`
			SELECT id, username, password_hash FROM users WHERE username = ?
		`).bind(username).first();

		if (!userResult) {
			return new Response(
				JSON.stringify({ error: "用户不存在" }),
				{ status: 401, headers: { "content-type": "application/json" } }
			);
		}

		if (userResult.password_hash !== hashedPassword) {
			return new Response(
				JSON.stringify({ error: "密码错误" }),
				{ status: 401, headers: { "content-type": "application/json" } }
			);
		}

		// Generate session token
		const sessionId = crypto.randomUUID();
		const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
		sessions.set(sessionId, { userId: userResult.id, expiresAt });

		return new Response(JSON.stringify({
			success: true,
			sessionId,
			username: userResult.username,
			userId: userResult.id
		}), {
			headers: { 
				"content-type": "application/json",
				"Set-Cookie": `sessionId=${sessionId}; Path=/; Max-Age=${7*24*60*60}; HttpOnly`
			}
		});
	} catch (error) {
		console.error("Login error:", error);
		return new Response(
			JSON.stringify({ error: "登录失败" }),
			{ status: 500, headers: { "content-type": "application/json" } }
		);
	}
}

/**
 * Handles GET /api/auth/check - Check authentication status
 */
function handleAuthCheck(request: Request): Response {
	const cookieHeader = request.headers.get("Cookie");
	let sessionId = null;

	if (cookieHeader) {
		const cookies = cookieHeader.split("; ");
		for (const cookie of cookies) {
			const [name, value] = cookie.split("=");
			if (name === "sessionId") {
				sessionId = value;
				break;
			}
		}
	}

	// Also check URL parameter for non-browser clients
	const url = new URL(request.url);
	const paramSessionId = url.searchParams.get("sessionId");
	if (paramSessionId) {
		sessionId = paramSessionId;
	}

	if (!sessionId || !sessions.has(sessionId)) {
		return new Response(JSON.stringify({ authenticated: false }), {
			headers: { "content-type": "application/json" }
		});
	}

	const session = sessions.get(sessionId)!;

	// Check if session expired
	if (Date.now() > session.expiresAt) {
		sessions.delete(sessionId);
		return new Response(JSON.stringify({ authenticated: false }), {
			headers: { "content-type": "application/json" }
		});
	}

	// Return user info
	return new Response(JSON.stringify({
		authenticated: true,
		userId: session.userId
	}), {
		headers: { "content-type": "application/json" }
	});
}
