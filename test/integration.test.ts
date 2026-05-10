# Integration Tests for AI Chat Application

import { describe, it, expect, beforeEach } from "vitest";
import { Env, ChatMessage, Contact } from "../src/types";
import { config } from "../src/config";
import { validate, loginUserSchema, createContactSchema } from "../src/validation";
import { hashPassword, verifyPassword, generateJWT } from "../src/auth";
import logger from "../src/logger";

describe("Production Build Validation", () => {
	it("should have JWT_SECRET configured", () => {
		expect(config.jwt.secret).toBeDefined();
		expect(config.jwt.secret.length).toBeGreaterThanOrEqual(32);
	});

	it("should have proper bcrypt rounds", () => {
		expect(config.security.bcryptRounds).toBeGreaterThanOrEqual(10);
	});

	it("should have rate limit configured", () => {
		expect(config.rateLimit.windowMs).toBeGreaterThan(0);
		expect(config.rateLimit.maxRequests).toBeGreaterThan(0);
	});
});

describe("Validation Schemas", () => {
	describe("loginUserSchema", () => {
		const testCases = [
			{ username: "ab", password: "password", shouldFail: true },
			{ username: "valid_user", password: "pass", shouldFail: true },
			{ username: "user!", password: "password123", shouldFail: true },
			{ username: "valid_user123", password: "password123", shouldFail: false },
		];

		testCases.forEach(({ username, password, shouldFail }) => {
			it(`should ${shouldFail ? 'reject' : 'accept'} login with username=${username}, password=****`, () => {
				const result = validate(loginUserSchema as any, { username, password });
				if (shouldFail) {
					expect(result.valid).toBe(false);
				} else {
					expect(result.valid).toBe(true);
				}
			});
		});
	});

	describe("createContactSchema", () => {
		it("should reject contact name too short", () => {
			const result = validate(createContactSchema as any, { 
				name: "A",
				initials: "X",
				persona: "You are helpful"
			});
			expect(result.valid).toBe(false);
		});

		it("should accept valid contact data", () => {
			const result = validate(createContactSchema as any, { 
				name: "Test Assistant",
				initials: "TA",
				persona: "You are a helpful AI assistant with expertise in multiple domains. You communicate clearly and concisely."
			});
			expect(result.valid).toBe(true);
		});
	});
});

describe("Authentication Helpers", () => {
	it("should hash and verify passwords", async () => {
		const password = "securePassword123";
		const hashed = await hashPassword(password);
		
		expect(hashed).toHaveLength(64); // SHA-256 produces 64 hex chars
		expect(await verifyPassword(password, hashed)).toBe(true);
		expect(await verifyPassword("wrongPassword", hashed)).toBe(false);
	});

	it("should generate valid JWT token", () => {
		const payload = { userId: 1, username: "testuser" };
		const token = generateJWT(payload);
		
		expect(token).toContain(".");
		const parts = token.split(".");
		expect(parts.length).toBe(2);
		
		const decoded = JSON.parse(atob(parts[1]));
		expect(decoded.userId).toBe(1);
		expect(decoded.username).toBe("testuser");
	});
});

describe("Logger", () => {
	let logs: string[] = [];

	beforeEach(() => {
		logs = [];
		jest.spyOn(console, 'info').mockImplementation((msg: any) => logs.push(msg));
	});

	it("should only log at configured level", () => {
		// Logger uses config.logging.level to filter
		const originalLevel = (config.logging as any).level;
		config.logging.level = "error";
		
		logger.info("This should not appear", undefined, "test");
		expect(logs).toHaveLength(0);
		
		config.logging.level = originalLevel;
	});
});
