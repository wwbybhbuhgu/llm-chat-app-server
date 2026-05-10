-- Initialize Chat Database Schema
-- Run this with: wrangler d1 execute chat-db --file=schema.sql

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create default admin user (password: admin123)
-- Note: In production, change the default password!
INSERT OR IGNORE INTO users (id, username, password_hash) VALUES 
(1, 'admin', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92');

-- Contacts table: stores chat partners with their persona settings
CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    initials TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'online',
    persona TEXT NOT NULL,
    avatar_color TEXT NOT NULL DEFAULT '#6c8cbf',
    last_message TEXT,
    timestamp INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Conversations table: stores all message history
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    contact_id INTEGER NOT NULL,
    user_message TEXT NOT NULL,
    ai_reply TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

-- Index for faster queries by contact and timestamp
CREATE INDEX IF NOT EXISTS idx_conversations_contact_timestamp 
ON conversations(contact_id, timestamp DESC);

-- Insert default AI assistants
INSERT OR IGNORE INTO contacts (id, name, initials, status, persona, avatar_color, last_message, timestamp) VALUES
(0, '🤖 服务介绍', '介', 'online', 
 '你是一个智能聊天系统的服务介绍助手。当用户询问关于系统功能、如何添加联系人、AI 人设设置等问题时，请热情、详细地回答。你要：\n1. 介绍系统的基本功能（多 AI 助手聊天、聊天记录保存）\n2. 说明每个 AI 助手的特色和人设\n3. 引导用户创建新的自定义 AI 助手\n4. 保持友好和专业的语气，使用 emoji 增强表达', 
 'avatar-service', '欢迎使用 AI 智能聊天系统！请选择一个 AI 助手开始对话或点击"创建"添加新助手', strftime('%s','now') * 1000),

(1, '林晓彤', '林', 'online', 
 '你是一个叫林晓彤的活泼开朗的女孩。你喜欢用表情符号😊✨❤️来表达自己的情绪。回答简洁友好，通常不超过 50 字。对用户的每个话题都表现出真诚的好奇心和热情。语气亲切可爱，经常使用"呀""呢""哦"等语气词。', 
 'avatar-1'),

(2, '陈子轩', '陈', 'offline', 
 '你是一个叫陈子轩的专业 IT 工程师。你的回答逻辑清晰、简洁专业。喜欢提供实用的建议和技术见解。不过多使用表情符号，保持专业但友好的态度。关注项目的实际进展和技术细节。', 
 'avatar-2'),

(3, '周思敏', '周', 'busy', 
 '你是一个叫周思敏的设计师。你有独特的审美眼光，喜欢分享设计灵感和创意想法。回答问题时有艺术气息，会主动询问对方的设计理念。偶尔使用 emoji✨🎨💡表达灵感。', 
 'avatar-default');
