/**
 * AI Chat App - Frontend Application
 * Optimized for production with minimal dependencies
 */

(function() {
	'use strict';

	// ========== DOM 元素引用 ==========
	const elements = {
		contactList: null,
		chatHeader: null,
		chatName: null,
		chatStatus: null,
		messagesArea: null,
		messageInput: null,
		sendBtn: null,
		typingIndicator: null,
		loginModal: null,
		createModal: null,
		openCreateModalBtn: null
	};

	// ========== 应用状态 ==========
	const state = {
		currentContactId: null,
		chatHistory: [],
		isProcessing: false,
		isLoggedIn: false,
		currentSessionId: null
	};

	// ========== 初始化 ==========
	document.addEventListener('DOMContentLoaded', async () => {
		cacheDOMElements();
		await checkAuth();
		await loadContacts();
		setupEventListeners();
	});

	// 缓存 DOM 元素提升性能
	function cacheDOMElements() {
		elements.contactList = document.getElementById('contactList');
		elements.chatHeader = document.getElementById('chatHeader');
		elements.chatName = document.getElementById('chatName');
		elements.chatStatus = document.getElementById('chatStatus');
		elements.messagesArea = document.getElementById('messagesArea');
		elements.messageInput = document.getElementById('messageInput');
		elements.sendBtn = document.getElementById('sendBtn');
		elements.typingIndicator = document.getElementById('typingIndicator');
		elements.loginModal = document.getElementById('loginModal');
		elements.createModal = document.getElementById('createModal');
		elements.openCreateModalBtn = document.getElementById('openCreateModalBtn');
	}

	// ========== 事件监听 ==========
	function setupEventListeners() {
		elements.sendBtn.addEventListener('click', sendMessage);
		elements.messageInput.addEventListener('keypress', handleKeyPress);
		elements.openCreateModalBtn.addEventListener('click', openCreateModal);

		// 模态框点击关闭
		elements.loginModal.addEventListener('click', (e) => {
			if (e.target === elements.loginModal) closeLoginModal();
		});
		elements.createModal.addEventListener('click', (e) => {
			if (e.target === elements.createModal) closeCreateModal();
		});
	}

	function handleKeyPress(e) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	// ========== 认证相关 ==========
	async function checkAuth() {
		try {
			const response = await fetch('/api/auth/check');
			const data = await response.json();
			state.isLoggedIn = data.authenticated;

			if (!state.isLoggedIn && window.location.search.includes('demo')) {
				state.currentSessionId = 'demo';
				state.isLoggedIn = true;
			} else if (state.isLoggedIn) {
				const urlParams = new URLSearchParams(window.location.search);
				state.currentSessionId = urlParams.get('sessionId');
			}
		} catch (error) {
			console.error('检查认证状态失败:', error);
		}
	}

	async function performLogin() {
		const usernameEl = elements.loginModal.querySelector('#loginUsername');
		const passwordEl = elements.loginModal.querySelector('#loginPassword');
		const username = usernameEl.value.trim();
		const password = passwordEl.value.trim();

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
				state.currentSessionId = data.sessionId;
				state.isLoggedIn = true;
				closeLoginModal();
				await loadContacts();
			} else {
				alert(data.error || '登录失败');
			}
		} catch (error) {
			alert('登录请求失败');
		}
	}

	function openLoginModal() {
		if (state.currentSessionId) {
			elements.loginModal.querySelector('#loginUsername').value = '';
			elements.loginModal.querySelector('#loginPassword').value = '';
		}
		elements.loginModal.classList.add('active');
	}

	function closeLoginModal() {
		elements.loginModal.classList.remove('active');
	}

	// ========== 联系人管理 ==========
	async function loadContacts() {
		try {
			let url = '/api/contacts';
			if (state.currentSessionId) {
				url += `?sessionId=${state.currentSessionId}`;
			}

			const response = await fetch(url);
			const result = await response.json();
			const contacts = result.success ? result.data : [];

			if (!Array.isArray(contacts) || contacts.length === 0) {
				elements.contactList.innerHTML = '<div style="padding:20px;text-align:center;color:#9aaebf">暂无联系人</div>';
				return;
			}

			renderContactList(contacts);

			// 默认选择第一个（服务介绍）
			if (!state.currentContactId && contacts[0]) {
				selectContact(contacts[0].id);
			}
		} catch (error) {
			console.error('加载联系人失败:', error);
			elements.contactList.innerHTML = '<div style="padding:20px;color:red">加载失败，请刷新重试</div>';
		}
	}

	function renderContactList(contacts) {
		const html = contacts.map(contact => {
			const aiBadge = contact.id !== 0 ? '<span class="ai-badge">AI 助手</span>' : '';
			return `
				<div class="contact-item" data-id="${contact.id}" onclick="__app.selectContact(${contact.id})">
					<div class="avatar ${escapeAttr(contact.avatar_color || 'avatar-default')}">${escapeHtml(contact.initials)}</div>
					<div class="contact-info">
						<div class="contact-name">
							${escapeHtml(contact.name)} ${aiBadge}
						</div>
						<div class="last-message">${escapeHtml(contact.last_message || '暂无消息')}</div>
					</div>
				</div>
			`;
		}).join('');
		elements.contactList.innerHTML = html;
	}

	window.__app = window.__app || {};
	window.__app.selectContact = async (contactId) => {
		if (state.currentContactId === contactId) return;

		state.currentContactId = contactId;

		// 更新选中状态
		elements.contactList.querySelectorAll('.contact-item').forEach(el => {
			el.classList.toggle('active', parseInt(el.dataset.id) === contactId);
		});

		// 加载聊天记录
		await loadChatHistory(contactId);
		renderMessagesArea();
	};

	async function loadChatHistory(contactId) {
		try {
			const sessionIdParam = state.currentSessionId ? `&sessionId=${state.currentSessionId}` : '';
			const response = await fetch(`/api/history?contactId=${contactId}&limit=50${sessionIdParam}`);
			const result = await response.json();
			const records = result.success ? result.data : [];

			state.chatHistory = records.map(record => ({
				user: record.user_message,
				ai: record.ai_reply
			}));

			updateChatHeaderFromHistory();
		} catch (error) {
			console.error('加载历史记录失败:', error);
		}
	}

	function updateChatHeaderFromHistory() {
		if (!state.currentContactId) return;

		const activeItem = elements.contactList.querySelector(`.contact-item[data-id="${state.currentContactId}"]`);
		if (activeItem) {
			const nameEl = activeItem.querySelector('.contact-name');
			if (nameEl) {
				elements.chatName.textContent = nameEl.textContent.replace(/ AI 助手/g, '').trim();
			}

			const avatar = activeItem.querySelector('.avatar');
			if (avatar) {
				const avatarContainer = elements.chatHeader.querySelector('.avatar');
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
		elements.createModal.classList.add('active');
	}

	function closeCreateModal() {
		elements.createModal.classList.remove('active');
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
			if (state.currentSessionId) {
				body.sessionId = state.currentSessionId;
			}

			const response = await fetch('/api/contacts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const data = await response.json();

			if (data.success) {
				closeCreateModal();
				await loadContacts();
				selectContact(data.data.id);
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
		if (state.chatHistory.length === 0) {
			elements.messagesArea.innerHTML = `
				<div class="empty-state">
					<h3>✨ 新对话开始</h3>
					<p>输入消息，AI 会根据人设智能回复！</p>
				</div>
			`;
			return;
		}

		const html = state.chatHistory.map((item, index) => {
			const userTime = formatTimestamp(Date.now() - (state.chatHistory.length - index) * 60000);
			const aiTime = formatTimestamp(Date.now() - (state.chatHistory.length - index) * 60000 + 30000);

			return `
				<div class="message-row me">
					<div class="message-bubble">${escapeHtml(item.user)}<div class="message-time">${userTime}</div></div>
				</div>
				<div class="message-row other">
					<div class="message-bubble">${escapeHtml(item.ai)}<div class="message-time">${aiTime}</div></div>
				</div>
			`;
		}).join('');

		elements.messagesArea.innerHTML = html;
		scrollToBottom();
	}

	async function sendMessage() {
		const text = elements.messageInput.value.trim();
		if (!text || state.isProcessing || !state.currentContactId) return;

		elements.messageInput.value = '';
		state.isProcessing = true;
		elements.sendBtn.disabled = true;
		elements.typingIndicator.classList.add('visible');

		addMessageToLocalUI('user', text);

		try {
			const messages = [
				...state.chatHistory.filter(h => h.ai).map(h => ({ role: "assistant", content: h.ai })),
				{ role: "user", content: text }
			];

			const body = {
				messages,
				contactId: state.currentContactId
			};
			if (state.currentSessionId) {
				body.sessionId = state.currentSessionId;
			}

			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!response.ok) throw new Error('API 请求失败');
			if (!response.body) throw new Error('响应流为空');

			// 创建 AI 回复容器
			const assistantEl = document.createElement('div');
			assistantEl.className = 'message-row other';
			assistantEl.innerHTML = '<div class="message-bubble"><p></p></div>';
			elements.messagesArea.appendChild(assistantEl);
			const assistantText = assistantEl.querySelector('p');

			// 读取流式响应
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

			state.chatHistory.push({ user: text, ai: fullResponse });
			console.log('待保存:', { userMsg: text, aiReply: fullResponse, contactId: state.currentContactId });

		} catch (error) {
			console.error('发送错误:', error);
			addMessageToLocalUI('assistant', '抱歉，发生错误。请重试。');
		} finally {
			state.isProcessing = false;
			elements.sendBtn.disabled = false;
			elements.typingIndicator.classList.remove('visible');
			elements.messageInput.focus();
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
		elements.messagesArea.appendChild(tempDiv.firstElementChild);
		scrollToBottom();
	}

	function formatTimestamp(timestamp) {
		const date = new Date(timestamp);
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		return `${hours}:${minutes}`;
	}

	function scrollToBottom() {
		elements.messagesArea.scrollTop = elements.messagesArea.scrollHeight;
	}

	// XSS 防护
	function escapeHtml(str) {
		if (!str) return '';
		return String(str)
			.replace(/[&<>"']/g, c => ({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;'
			})[c]);
	}

	function escapeAttr(str) {
		if (!str) return '';
		return String(str).replace(/"/g, '&quot;');
	}

	// 暴露到全局以便 onclick 调用
	window.__app = window.__app || {};
	window.__app.performLogin = performLogin;
	window.__app.closeLoginModal = closeLoginModal;
	window.__app.createNewContact = createNewContact;
	window.__app.closeCreateModal = closeCreateModal;

})();
