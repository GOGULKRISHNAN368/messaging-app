import React, { useState, useEffect } from 'react';
import Auth from './components/Auth';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import { AddContactModal, CreateGroupModal } from './components/Modals';
import { userAPI, groupAPI } from './services/api';
import socketService from './services/socket';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [messages, setMessages] = useState({});
  const [isTyping, setIsTyping] = useState({});
  const [onlineUsers, setOnlineUsers] = useState({});
  const [replyTo, setReplyTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      setCurrentUser(JSON.parse(storedUser));
    }
  }, []);

  useEffect(() => {
    if (currentUser && token) {
      initializeApp();
    }

    return () => {
      if (socketService.isConnected()) {
        socketService.disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, token]);

  const initializeApp = async () => {
    socketService.connect(currentUser.id, token);
    await fetchContacts();
    await fetchGroups();
    setupSocketListeners();
  };

  const fetchContacts = async () => {
    try {
      const response = await userAPI.getContacts();
      setContacts(response.data.map(c => ({
        id: c._id,
        name: c.name,
        uniqueId: c.uniqueId,
        isOnline: c.isOnline,
        lastSeen: c.lastSeen,
        isGroup: false
      })));
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    }
  };

  const fetchGroups = async () => {
    try {
      const response = await groupAPI.getGroups();
      setGroups(response.data.map(g => ({
        id: g._id,
        name: g.name,
        uniqueId: g.uniqueId,
        members: g.members,
        isGroup: true
      })));
    } catch (error) {
      console.error('Failed to fetch groups:', error);
    }
  };

  const setupSocketListeners = () => {
    socketService.onMessageReceived((msg) => {
      const contactId = msg.recipientId || msg.groupId;
      setMessages(prev => ({
        ...prev,
        [contactId]: [...(prev[contactId] || []), formatMessage(msg)]
      }));
    });

    socketService.onMessageSent((msg) => {
      const contactId = msg.recipientId || msg.groupId;
      setMessages(prev => ({
        ...prev,
        [contactId]: [...(prev[contactId] || []), formatMessage(msg)]
      }));
    });

    socketService.onMessageStatusUpdate(({ messageId, status }) => {
      setMessages(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(contactId => {
          updated[contactId] = updated[contactId].map(msg =>
            msg.id === messageId ? { ...msg, status } : msg
          );
        });
        return updated;
      });
    });

    // NEW: Listen for message edits
    socketService.onMessageEdited(({ messageId, newText }) => {
      setMessages(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(contactId => {
          updated[contactId] = updated[contactId].map(msg =>
            msg.id === messageId ? { ...msg, text: newText, edited: true } : msg
          );
        });
        return updated;
      });
    });

    // NEW: Listen for message deletions
    socketService.onMessageDeleted(({ messageId, deletedForEveryone }) => {
      setMessages(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(contactId => {
          updated[contactId] = updated[contactId].map(msg =>
            msg.id === messageId ? { ...msg, deleted: true, deletedForEveryone } : msg
          );
        });
        return updated;
      });
    });

    socketService.onUserTyping(({ userId, isTyping: typing }) => {
      setIsTyping(prev => ({ ...prev, [userId]: typing }));
    });

    socketService.onUserStatusChanged(({ userId, isOnline, lastSeen }) => {
      setOnlineUsers(prev => ({ ...prev, [userId]: isOnline }));
      setContacts(prev =>
        prev.map(c => c.id === userId ? { ...c, isOnline, lastSeen } : c)
      );
    });
  };

  const formatMessage = (msg) => ({
    id: msg._id,
    senderId: msg.senderId,
    recipientId: msg.recipientId,
    groupId: msg.groupId,
    text: msg.text,
    timestamp: msg.timestamp,
    status: msg.status,
    replyTo: msg.replyTo,
    edited: msg.edited,
    deleted: msg.deleted,
    deletedForEveryone: msg.deletedForEveryone,
    senderName: msg.senderName
  });

  const handleAuthSuccess = (user, authToken) => {
    setCurrentUser(user);
    setToken(authToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    socketService.disconnect();
    setCurrentUser(null);
    setToken(null);
    setContacts([]);
    setGroups([]);
    setMessages({});
  };

  const handleSelectContact = async (contact) => {
    setSelectedContact(contact);
    
    if (!messages[contact.id]) {
      try {
        const endpoint = contact.isGroup 
          ? `/messages/group/${contact.id}`
          : `/messages/${contact.id}`;
        const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api${endpoint}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await response.json();
        setMessages(prev => ({
          ...prev,
          [contact.id]: data.map(formatMessage)
        }));
      } catch (error) {
        console.error('Failed to fetch messages:', error);
      }
    }
  };

  const handleSendMessage = (text, replyToId, editId) => {
    if (!selectedContact) return;

    // If editing a message
    if (editId) {
      socketService.editMessage({
        messageId: editId,
        newText: text,
        recipientId: selectedContact.isGroup ? null : selectedContact.id,
        groupId: selectedContact.isGroup ? selectedContact.id : null
      });
      
      // Update locally
      setMessages(prev => ({
        ...prev,
        [selectedContact.id]: prev[selectedContact.id].map(msg =>
          msg.id === editId ? { ...msg, text, edited: true } : msg
        )
      }));
      
      setEditingMessage(null);
      return;
    }

    // Normal message sending
    const messageData = {
      senderId: currentUser.id,
      text,
      replyTo: replyToId
    };

    if (selectedContact.isGroup) {
      messageData.groupId = selectedContact.id;
    } else {
      messageData.recipientId = selectedContact.id;
    }

    socketService.sendMessage(messageData);
    
    if (!selectedContact.isGroup) {
      socketService.sendTypingIndicator(selectedContact.id, currentUser.id, false);
    }
    
    setReplyTo(null);
  };

  const handleAddContact = async (uniqueId) => {
    try {
      await userAPI.addContact(uniqueId);
      await fetchContacts();
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to add contact');
    }
  };

  const handleCreateGroup = async (name, memberIds) => {
    try {
      await groupAPI.createGroup({ name, members: memberIds });
      await fetchGroups();
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to create group');
    }
  };

  const handleReply = (message) => {
    setReplyTo(message);
  };

  const handleEdit = (message) => {
    setEditingMessage(message);
    setReplyTo(null);
  };

  const handleDelete = (messageId, deleteForEveryone) => {
    if (!selectedContact) return;

    socketService.deleteMessage({
      messageId,
      deletedForEveryone: deleteForEveryone,
      recipientId: selectedContact.isGroup ? null : selectedContact.id,
      groupId: selectedContact.isGroup ? selectedContact.id : null
    });

    // Update locally
    setMessages(prev => ({
      ...prev,
      [selectedContact.id]: prev[selectedContact.id].map(msg =>
        msg.id === messageId
          ? { ...msg, deleted: true, deletedForEveryone: deleteForEveryone }
          : msg
      )
    }));
  };

  const allContacts = [...contacts, ...groups];

  if (!currentUser) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {showSidebar && (
        <Sidebar
          currentUser={currentUser}
          contacts={allContacts}
          selectedContact={selectedContact}
          onSelectContact={handleSelectContact}
          onLogout={handleLogout}
          onAddContact={() => setShowAddContact(true)}
          onCreateGroup={() => setShowGroupModal(true)}
          onlineUsers={onlineUsers}
        />
      )}

      <ChatWindow
        selectedContact={selectedContact}
        currentUser={currentUser}
        messages={messages[selectedContact?.id] || []}
        onSendMessage={handleSendMessage}
        onReply={handleReply}
        onEdit={handleEdit}
        onDelete={handleDelete}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        editingMessage={editingMessage}
        onCancelEdit={() => setEditingMessage(null)}
        isTyping={isTyping}
        onlineUsers={onlineUsers}
        onToggleSidebar={() => setShowSidebar(!showSidebar)}
      />

      <AddContactModal
        show={showAddContact}
        onClose={() => setShowAddContact(false)}
        onAddContact={handleAddContact}
      />

      <CreateGroupModal
        show={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        onCreateGroup={handleCreateGroup}
        contacts={contacts}
      />
    </div>
  );
}

export default App;