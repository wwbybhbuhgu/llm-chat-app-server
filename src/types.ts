/**
 * Type definitions for the LLM chat application.
 */

export interface Env {
	/**
	 * Binding for the Workers AI API.
	 */
	AI: Ai;

	/**
	 * Binding for static assets.
	 */
	ASSETS: { fetch: (request: Request) => Promise<Response> };

	/**
	 * Binding for D1 database.
	 */
	DB: D1Database;
}

/**
 * Represents a chat message.
 */
export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

/**
 * Represents a contact/chat partner with persona settings.
 */
export interface Contact {
	id: number;
	name: string;
	initials: string;
	status: "online" | "offline" | "busy";
	persona: string; // 人设提示词，用于生成个性化回复
	avatarColor: string;
	lastMessage?: string;
	timestamp?: number;
}

/**
 * Represents a saved conversation record in the database.
 */
export interface ConversationRecord {
	id: string;
	contact_id: number;
	user_message: string;
	ai_reply: string;
	timestamp: number;
}
