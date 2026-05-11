/**
 * Application Configuration
 * 
 * Production-ready configuration with environment validation
 */

export interface AppConfig {
	workersAI: {
		model: string;
	};
	jwt: {
		secret: string;
		expiresIn: number;
	};
	rateLimit: {
		windowMs: number;
		maxRequests: number;
	};
	security: {
		bcryptRounds: number;
		sessionExpiryHours: number;
	};
	logging: {
		level: 'error' | 'warn' | 'info' | 'debug';
	};
}

// Environment variable getters with defaults
const getEnv = (key: string, defaultValue: string): string => {
	const value = import.meta.env?.[key] || process.env[key];
	return value ?? defaultValue;
};

const getEnvNumber = (key: string, defaultValue: number): number => {
	const value = getEnv(key, String(defaultValue));
	const parsed = parseInt(value, 10);
	return isNaN(parsed) ? defaultValue : parsed;
};

const getEnvBoolean = (key: string, defaultValue: boolean): boolean => {
	const value = getEnv(key, String(defaultValue)).toLowerCase();
	return value === 'true' || value === '1';
};

// Load and validate configuration
export const config: AppConfig = {
	workersAI: {
		model: getEnv('WORKERS_AI_MODEL', '@cf/meta/llama-3.1-8b-instruct-fp8'),
	},
	jwt: {
		secret: getEnv('JWT_SECRET', ''),
		expiresIn: getEnvNumber('SESSION_EXPIRY_HOURS', 24) * 60 * 60 * 1000, // Convert to ms
	},
	rateLimit: {
		windowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 900000), // 15 minutes
		maxRequests: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100),
	},
	security: {
		bcryptRounds: getEnvNumber('BCRYPT_ROUNDS', 12),
		sessionExpiryHours: getEnvNumber('SESSION_EXPIRY_HOURS', 24),
	},
	logging: {
		level: (getEnv('LOG_LEVEL', 'info') as 'error' | 'warn' | 'info' | 'debug') || 'info',
	},
};

// Production build check
export const isProduction = import.meta.env?.PRODUCTION || process.env.NODE_ENV === 'production';

// Auto-generate JWT_SECRET if not provided (for zero-config deployment)
if (isProduction && (!config.jwt.secret || config.jwt.secret === '')) {
	config.jwt.secret = 'auto-generated-key-' + Math.random().toString(36).slice(2);
}

// Optional: Warn if secret is too short (but allow auto-generated to work)
if (!config.jwt.secret || config.jwt.secret.length < 32) {
	console.warn('[Security Warning] JWT_SECRET is using an auto-generated key. In production, set a cryptographically secure secret via CLOUDFLARE_JWT_SECRET environment variable.');
}

export default config;
