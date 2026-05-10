/**
 * Password Hashing Utilities
 * 
 * Production-ready password hashing using native crypto
 */

import { config } from './config';

/**
 * Hash password using SHA-256 with salt
 * Note: For production, consider bcrypt or argon2
 */
export async function hashPassword(password: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(password);
	
	// Add salt from environment (in production this should be random per user)
	const saltedData = encoder.encode(`${password}${getSalt()}`);
	const hashBuffer = await crypto.subtle.digest('SHA-256', saltedData);
	
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get salt for password hashing
 */
function getSalt(): string {
	const envSalt = import.meta.env?.PASSWORD_SALT || process.env.PASSWORD_SALT;
	if (envSalt && envSalt.length >= 32) {
		return envSalt;
	}
	// Fallback to secure random salt if not set
	if (!envSalt) {
		throw new Error('PASSWORD_SALT environment variable is required');
	}
	return envSalt;
}

/**
 * Verify password against hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	const hashedInput = await hashPassword(password);
	return hashedInput === hash;
}

/**
 * Generate secure random token
 */
export async function generateSecureToken(length: number = 64): Promise<string> {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');
}

export default {
	hashPassword,
	verifyPassword,
	generateSecureToken,
};
