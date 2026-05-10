/**
 * Input Validation Schemas (Zod)
 * 
 * Type-safe request validation for production security
 */

import { z } from 'zod';

// ============== User Schema ==============

export const loginUserSchema = z.object({
	username: z
		.string()
		.min(3, '用户名至少 3 个字符')
		.max(50, '用户名不能超过 50 个字符')
		.regex(/^[a-zA-Z0-9_-]+$/, '用户名只能包含字母、数字、下划线和连字符'),
	password: z
		.string()
		.min(6, '密码至少 6 个字符')
		.max(100, '密码不能超过 100 个字符'),
});

export type LoginInput = z.infer<typeof loginUserSchema>;

// ============== Contact Schema ==============

export const createContactSchema = z.object({
	name: z
		.string()
		.min(2, '助手名称至少 2 个字符')
		.max(50, '助手名称不能超过 50 个字符'),
	initials: z
		.string()
		.min(1, '首字缩写不能为空')
		.max(3, '首字缩写不超过 3 个字符'),
	persona: z
		.string()
		.min(10, '人设提示词至少 10 个字符')
		.max(2000, '人设提示词不能超过 2000 个字符'),
	avatarColor: z
		.enum(['avatar-1', 'avatar-2', 'default', 'service-custom', 'avatar-service'])
		.default('service-custom'),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;

// ============== Chat Message Schema ==============

export const chatMessageSchema = z.object({
	messages: z
		.array(
			z.object({
				role: z.enum(['system', 'user', 'assistant']),
				content: z.string().min(1, '消息内容不能为空').max(4000),
			})
		)
		.min(1, '至少需要一条消息')
		.max(20, '最多支持 20 条历史消息'),
	contactId: z.number().int().positive('联系人 ID 必须为正整数'),
	sessionId: z.string().uuid().optional(),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

// ============== Authentication Schema ==============

export interface AuthHeaders {
	headers?: Record<string, string>;
}

export const authMiddlewareSchema = z.object({
	sessionId: z.string().uuid().optional(),
	jwtToken: z.string().optional(),
});

export type AuthCheckInput = z.infer<typeof authMiddlewareSchema>;

// ============== Query Parameters ==============

export const historyQuerySchema = z.object({
	contactId: z.coerce.number().int().positive(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type HistoryQueryParams = z.infer<typeof historyQuerySchema>;

// ============== Error Response Schema ==============

export const errorResponseSchema = z.object({
	error: z.string(),
	message: z.string().optional(),
	code: z.string().optional(),
	timestamp: z.number(),
	path: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// ============== Success Response Schema ==============

export const successResponseSchema = z.object({
	success: z.boolean(),
	data: z.any().optional(),
	message: z.string().optional(),
});

export type SuccessResponse<T = unknown> = z.infer<typeof successResponseSchema> & { data?: T };

// Validation helpers
export function validate<T extends z.ZodType>(schema: T, data: unknown): {
	valid: boolean;
	data: z.infer<T>;
	errors?: string[];
} {
	try {
		return { valid: true, data: schema.parse(data) };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				valid: false,
				data: {} as z.infer<T>,
				errors: error.errors.map((e) => e.message),
			};
		}
		throw error;
	}
}

export default {
	loginUserSchema,
	createContactSchema,
	chatMessageSchema,
	historyQuerySchema,
	validate,
};
