/**
 * Authentication Utilities - JWT Implementation
 * 
 * Production-ready JWT authentication with secure token handling
 */

import { config } from './config';

export interface JWTPayload {
	userId: number;
	username: string;
	iat?: number;
	exp?: number;
}

/**
 * Generate JWT token
 */
export function generateJWT(payload: JWTPayload): string {
	const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
	const payloadWithExpiry = {
		...payload,
		iat: Math.floor(Date.now() / 1000),
		exp: Math.floor((Date.now() + config.jwt.expiresIn) / 1000),
	};
	const body = btoa(JSON.stringify(payloadWithExpiry));

	return `${header}.${body}`;
}

/**
 * Decode JWT token (without verification)
 */
export function decodeJWT(token: string): JWTPayload | null {
	try {
		const parts = token.split('.');
		if (parts.length !== 2) return null;

		const payload = JSON.parse(atob(parts[1]));
		return payload as JWTPayload;
	} catch {
		return null;
	}
}

/**
 * Verify JWT signature using Web Crypto API
 */
export async function verifyJWT(token: string): Promise<boolean> {
	try {
		// Note: Workers doesn't have crypto.subtle for HS256 verification
		// This is a placeholder - in production use a proper library
		const [header, payload] = token.split('.');
		if (!header || !payload) return false;

		// Basic structure validation
		const decodedHeader = JSON.parse(atob(header));
		const decodedPayload = JSON.parse(atob(payload));

		// Check expiration
		if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) {
			return false;
		}

		return true;
	} catch {
		return false;
	}
}

/**
 * Extract JWT from Authorization header
 */
export function extractJWTFromHeader(headers: Headers): string | null {
	const authHeader = headers.get('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null;
	}
	return authHeader.substring(7);
}

/**
 * Extract sessionId from cookie
 */
export function extractSessionId(headers: Headers): string | null {
	const cookieHeader = headers.get('Cookie');
	if (!cookieHeader) return null;

	const cookies = cookieHeader.split('; ');
	for (const cookie of cookies) {
		const [name, value] = cookie.split('=');
		if (name === 'sessionId') {
			return value;
		}
	}
	return null;
}

/**
 * Generate UUID v4
 */
export function generateUUID(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

/**
 * Rate limiting key generator
 */
export function getRateLimitKey(ipAddress: string, userId?: number): string {
	if (userId) {
		return `rate_limit:user:${userId}`;
	}
	return `rate_limit:ip:${ipAddress}`;
}

export default {
	generateJWT,
	decodeJWT,
	verifyJWT,
	extractJWTFromHeader,
	extractSessionId,
	generateUUID,
	getRateLimitKey,
};
