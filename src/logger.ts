/**
 * Logger Utility - Production Logging System
 */

import { config } from './config';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogRecord {
	timestamp: number;
	level: LogLevel;
	message: string;
	meta?: Record<string, unknown>;
	context?: string;
}

class Logger {
	private formatTimestamp(timestamp: number): string {
		return new Date(timestamp).toISOString();
	}

	private shouldLog(level: LogLevel): boolean {
		const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
		const levelIndex = levels.indexOf(level);
		const logLevelIndex = levels.indexOf(config.logging.level);
		return levelIndex >= logLevelIndex;
	}

	private formatMessage(record: LogRecord): string {
		const parts = [
			`[${this.formatTimestamp(record.timestamp)}]`,
			`[${record.level.toUpperCase()}]`,
			record.context ? `[${record.context}]` : '',
			record.message,
		].filter(Boolean);

		if (record.meta) {
			parts.push(JSON.stringify(record.meta));
		}

		return parts.join(' ');
	}

	log(level: LogLevel, message: string, meta?: Record<string, unknown>, context?: string): void {
		if (!this.shouldLog(level)) return;

		const record: LogRecord = {
			timestamp: Date.now(),
			level,
			message,
			meta,
			context,
		};

		const formatted = this.formatMessage(record);

		switch (level) {
			case 'error':
				console.error(formatted);
				break;
			case 'warn':
				console.warn(formatted);
				break;
			case 'info':
				console.info(formatted);
				break;
			case 'debug':
				console.debug(formatted);
				break;
		}
	}

	error(message: string, meta?: Record<string, unknown>, context?: string): void {
		this.log('error', message, meta, context);
	}

	warn(message: string, meta?: Record<string, unknown>, context?: string): void {
		this.log('warn', message, meta, context);
	}

	info(message: string, meta?: Record<string, unknown>, context?: string): void {
		this.log('info', message, meta, context);
	}

	debug(message: string, meta?: Record<string, unknown>, context?: string): void {
		this.log('debug', message, meta, context);
	}

	// Request logging helper
	requestLogger(method: string, url: string, status: number, duration: number) {
		const logLevel: LogLevel = status >= 400 ? 'error' : status >= 300 ? 'warn' : 'info';
		this.log(
			logLevel,
			`${method} ${url} ${status} ${duration}ms`,
			{ method, url, status, duration },
			'request'
		);
	}
}

export const logger = new Logger();
export default logger;
