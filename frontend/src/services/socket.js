import io from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect(userId, token) {
    if (this.socket) {
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      auth: { token: token },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('✅ Connected to socket server');
      this.socket.emit('user_online', userId);
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Disconnected from socket server');
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.listeners.clear();
    }
  }

  sendMessage(data) {
    if (!this.socket) {
      console.error('Socket not connected');
      return;
    }
    this.socket.emit('send_message', data);
  }

  // NEW: Edit message
  editMessage(data) {
    if (!this.socket) {
      console.error('Socket not connected');
      return;
    }
    this.socket.emit('edit_message', data);
  }

  // NEW: Delete message
  deleteMessage(data) {
    if (!this.socket) {
      console.error('Socket not connected');
      return;
    }
    this.socket.emit('delete_message', data);
  }

  sendTypingIndicator(recipientId, senderId, isTyping) {
    if (!this.socket) return;
    this.socket.emit('typing', { recipientId, senderId, isTyping });
  }

  markAsRead(messageIds, senderId, readBy) {
    if (!this.socket) return;
    this.socket.emit('message_read', { messageIds, senderId, readBy });
  }

  onMessageReceived(callback) {
    if (!this.socket) return;
    this.socket.on('message_received', callback);
    this.listeners.set('message_received', callback);
  }

  onMessageSent(callback) {
    if (!this.socket) return;
    this.socket.on('message_sent', callback);
    this.listeners.set('message_sent', callback);
  }

  onMessageStatusUpdate(callback) {
    if (!this.socket) return;
    this.socket.on('message_status_update', callback);
    this.listeners.set('message_status_update', callback);
  }

  // NEW: Listen for message edits
  onMessageEdited(callback) {
    if (!this.socket) return;
    this.socket.on('message_edited', callback);
    this.listeners.set('message_edited', callback);
  }

  // NEW: Listen for message deletions
  onMessageDeleted(callback) {
    if (!this.socket) return;
    this.socket.on('message_deleted', callback);
    this.listeners.set('message_deleted', callback);
  }

  onUserTyping(callback) {
    if (!this.socket) return;
    this.socket.on('user_typing', callback);
    this.listeners.set('user_typing', callback);
  }

  onUserStatusChanged(callback) {
    if (!this.socket) return;
    this.socket.on('user_status_changed', callback);
    this.listeners.set('user_status_changed', callback);
  }

  removeAllListeners() {
    if (!this.socket) return;
    this.listeners.forEach((callback, event) => {
      this.socket.off(event, callback);
    });
    this.listeners.clear();
  }

  isConnected() {
    return this.socket && this.socket.connected;
  }
}
const socketServiceInstance = new SocketService();
export default socketServiceInstance;