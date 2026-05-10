/**
 * AI Chat App with Multi-Contact Support + Login + Create New Contact
 */

// DOM 元素
const contactList = document.getElementById('contactList');
const chatHeader = document.getElementById('chatHeader');
const chatName = document.getElementById('chatName');
const chatStatus = document.getElementById('chatStatus');
const messagesArea = document.getElementById('messagesArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const typingIndicator = document.getElementById('typingIndicator');
const loginModal = document.getElementById('loginModal');
const createModal = document.getElementById('createModal');
const openCreateModalBtn = document.getElementById('openCreateModalBtn');

// 状态
let currentContactId = null;
let chatHistory = [];
let isProcessing = false;
let isLoggedIn = false;
let currentSessionId = null;

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
	await checkAuth();
	await loadContacts();
	setupEventListeners();
});

// ========== 事件监听 ==========
function setupEventListeners() {
	sendBtn.addEventListener('click', sendMessage);
	messageInput.addEventListener('keypress', (e) => {
		if (e.key === 'Enter') sendMessage();
	});
	openCreateModalBtn.addEventListener('click', openCreateModal);
	
	// 点击遮罩层关闭模态框
	loginModal.addEventListener('click', (e) => {
		if (e.target === loginModal) closeLoginModal();
	});
	createModal.addEventListener('click', (e) => {
		if (e.target === createModal) closeCreateModal();
	});
}

// ========== 认证相关 ==========
async function checkAuth() {
	try {
		const response = await fetch('/api/auth/check');
		const data = await response.json();
		isLoggedIn = data.authenticated;
		
		if (!isLoggedIn && window.location.search.includes('demo')) {
			// Demo 模式，允许不登录访问
			currentSessionId = 'demo';
			isLoggedIn = true;
		} else if (isLoggedIn) {
			currentSessionId = new URL(window.location.href).searchParams.get('sessionId');
		}
	} catch (error) {
		console.error('检查认证状态失败:', error);
	}
}

async function performLogin() {
	const username = document.getElementById('loginUsername').value.trim();
	const password = document.getElementById('loginPassword').value.trim();
	
	if (!username || !password) {
		alert('请输入用户名和密码');
		return;
	}
	
	try {
		const response = await fetch('/api/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username, password })
		});
		
		const data = await response.json();
		
		if (data.success) {
			currentSessionId = data.sessionId;
			isLoggedIn = true;
			closeLoginModal();
			loadContacts(); // 重新加载联系人（可能包含新创建的）
		} else {
			alert(data.error || '登录失败');
		}
	} catch (error) {
		alert('登录请求失败');
	}
}

function openLoginModal() {
	if (currentSessionId) {
		loginModal.querySelector('#loginUsername').value = '';
		loginModal.querySelector('#loginPassword').value = '';
	}
	loginModal.classList.add('active');
}

function closeLoginModal() {
	loginModal.classList.remove('active');
}

// ========== 联系人管理 ==========
async function loadContacts() {
	try {
		let url = '/api/contacts';
		if (currentSessionId) {
			url += `?sessionId=${currentSessionId}`;
		}
		
		const response = await fetch(url);
		const contacts = await response.json();
		
		if (contacts.length === 0) {
			contactList.innerHTML = '<div style="padding:20px;text-align:center;color:#9aaebf">暂无联系人</div>';
			return;
		}
		
		let html = '';
		contacts.forEach(contact => {
			const aiBadge = contact.id !== 0 ? '<span class="ai-badge">AI 助手</span>' : '';
			html += `
				<div class="contact-item" data-id="${contact.id}" onclick="selectContact(${contact.id})">
					<div class="avatar ${contact.avatar_color || 'avatar-default'}">${escapeHtml(contact.initials)}</div>
					<div class="contact-info">
						<div class="contact-name">
							${escapeHtml(contact.name)} ${aiBadge}
						</div>
						<div class="last-message">${escapeHtml(contact.last_message || '暂无消息')}</div>
					</div>
				</div>
			`;
		});
		contactList.innerHTML = html;
		
		// 默认选择第一个（服务介绍）
		if (!currentContactId && contacts[0]) {
			selectContact(contacts[0].id);
		}
	} catch (error) {
		console.error('加载联系人失败:', error);
		contactList.innerHTML = '<div style="padding:20px;color:red">加载失败，请刷新重试</div>';
	}
}

window.selectContact = async (contactId) => {
	if (currentContactId === contactId) return;
	
	currentContactId = contactId;
	
	// 更新选中状态
	document.querySelectorAll('.contact-item').forEach(el => {
		el.classList.toggle('active', parseInt(el.dataset.id) === contactId);
	});
	
	// 加载聊天记录
	await loadChatHistory(contactId);
	renderMessagesArea();
};

async function loadChatHistory(contactId) {
	try {
		const sessionIdParam = currentSessionId ? `&sessionId=${currentSessionId}` : '';
		const response = await fetch(`/api/history?contactId=${contactId}&limit=50${sessionIdParam}`);
		const records = await response.json();
		
		chatHistory = records.map(record => ({
			user: record.user_message,
			ai: record.ai_reply
		}));
		
		updateChatHeaderFromHistory();
	} catch (error) {
		console.error('加载历史记录失败:', error);
	}
}

function updateChatHeaderFromHistory() {
	if (!currentContactId) return;
	
	// 从当前联系人列表中获取信息
	const activeItem = document.querySelector(`.contact-item[data-id="${currentContactId}"]`);
	if (activeItem) {
		const nameEl = activeItem.querySelector('.contact-name');
		if (nameEl) {
			chatName.textContent = nameEl.textContent.replace(/ AI 助手/g, '').trim();
		}
		
		const avatar = activeItem.querySelector('.avatar');
		if (avatar) {
			const avatarContainer = chatHeader.querySelector('.avatar');
			avatarContainer.className = avatar.className;
			avatarContainer.textContent = avatar.textContent;
		}
	}
}

// ========== 创建新联系人 ==========
function openCreateModal() {
	document.getElementById('newContactName').value = '';
	document.getElementById('newContactInitials').value = '';
	document.getElementById('newContactPersona').value = '';
	createModal.classList.add('active');
}

function closeCreateModal() {
	createModal.classList.remove('active');
}

async function createNewContact() {
	const name = document.getElementById('newContactName').value.trim();
	const initials = document.getElementById('newContactInitials').value.trim();
	const persona = document.getElementById('newContactPersona').value.trim();
	const avatarColor = document.getElementById('newContactColor').value;
	
	if (!name || !initials || !persona) {
		alert('请填写所有必填字段');
		return;
	}
	
	try {
		const body = { name, initials, persona, avatarColor };
		if (currentSessionId) {
			body.sessionId = currentSessionId;
		}
		
		const response = await fetch('/api/contacts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		
		const data = await response.json();
		
		if (data.success) {
			closeCreateModal();
			await loadContacts(); // 刷新列表
			selectContact(data.id); // 自动选择新创建的联系人
		} else {
			alert(data.error || '创建失败');
		}
	} catch (error) {
		console.error('创建联系人失败:', error);
		alert('创建失败，请重试');
	}
}

// ========== 聊天功能 ==========
function renderMessagesArea() {
	if (chatHistory.length === 0) {
		messagesArea.innerHTML = `
			<div class="empty-state">
				<h3>✨ 新对话开始</h3>
				<p>输入消息，AI 会根据人设智能回复！</p>
			</div>
		`;
		return;
	}
	
	let html = '';
	chatHistory.forEach((item, index) => {
		const userTime = formatTimestamp(Date.now() - (chatHistory.length - index) * 60000);
		const aiTime = formatTimestamp(Date.now() - (chatHistory.length - index) * 60000 + 30000);
		
		html += `
			<div class="message-row me">
				<div class="message-bubble">${escapeHtml(item.user)}<div class="message-time">${userTime}</div></div>
			</div>
			<div class="message-row other">
				<div class="message-bubble">${escapeHtml(item.ai)}<div class="message-time">${aiTime}</div></div>
			</div>
		`;
	});
	
	messagesArea.innerHTML = html;
	scrollToBottom();
}

async function sendMessage() {
	const text = messageInput.value.trim();
	if (!text || isProcessing || !currentContactId) return;
	
	messageInput.value = '';
	isProcessing = true;
	sendBtn.disabled = true;
	typingIndicator.classList.add('visible');
	
	addMessageToLocalUI('user', text);
	
	try {
		const messages = [
			...chatHistory.filter(h => h.ai).map(h => ({ role: "assistant", content: h.ai })),
			{ role: "user", content: text }
		];
		
		const body = {
			messages: messages,
			contactId: currentContactId
		};
		if (currentSessionId) {
			body.sessionId = currentSessionId;
		}
		
		const response = await fetch('/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		
		if (!response.ok) throw new Error('API 请求失败');
		if (!response.body) throw new Error('响应流为空');
		
		const assistantEl = document.createElement('div');
		assistantEl.className = 'message-row other';
		assistantEl.innerHTML = '<div class="message-bubble"><p></p></div>';
		messagesArea.appendChild(assistantEl);
		const assistantText = assistantEl.querySelector('p');
		
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let fullResponse = '';
		let buffer = '';
		
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n\n');
			buffer = lines.pop() || '';
			
			for (const line of lines) {
				const data = line.replace(/^data:\s*/, '').trim();
				if (data === '[DONE]') continue;
				
				try {
					const json = JSON.parse(data);
					let content = '';
					
					if (typeof json.response === 'string') {
						content = json.response;
					} else if (json.choices?.[0]?.delta?.content) {
						content = json.choices[0].delta.content;
					}
					
					if (content) {
						fullResponse += content;
						assistantText.textContent = fullResponse;
						scrollToBottom();
					}
				} catch (e) {
					console.warn('解析 SSE 数据失败:', e);
				}
			}
		}
		
		chatHistory.push({ user: text, ai: fullResponse });
		
		// 标记待保存（实际项目中可以在后端同步保存）
		console.log('待保存:', { userMsg: text, aiReply: fullResponse, contactId: currentContactId });
		
	} catch (error) {
		console.error('发送错误:', error);
		addMessageToLocalUI('assistant', '抱歉，发生错误。请重试。');
	} finally {
		isProcessing = false;
		sendBtn.disabled = false;
		typingIndicator.classList.remove('visible');
		messageInput.focus();
	}
}

// ========== 辅助函数 ==========
function addMessageToLocalUI(type, text) {
	const rowClass = type === 'user' ? 'me' : 'other';
	const time = formatTimestamp(Date.now());
	
	const html = `
		<div class="message-row ${rowClass}">
			<div class="message-bubble">${escapeHtml(text)}<div class="message-time">${time}</div></div>
		</div>
	`;
	
	const tempDiv = document.createElement('div');
	tempDiv.innerHTML = html;
	messagesArea.appendChild(tempDiv.firstElementChild);
	scrollToBottom();
}

function formatTimestamp(timestamp) {
	const date = new Date(timestamp);
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	return `${hours}:${minutes}`;
}

function scrollToBottom() {
	messagesArea.scrollTop = messagesArea.scrollHeight;
}

function escapeHtml(str) {
	if (!str) return '';
	return str.replace(/[&<>"']/g, c => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
	})[c]);
}
