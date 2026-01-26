# Product Requirements Document (PRD)

## GCG Team Messaging Application (TMA)

**Document Version:** 1.0
**Date:** January 23, 2026
**Status:** Current Implementation
**Prepared For:** GCG Corporation

---

## 1. Executive Summary

### 1.1 Product Overview

The GCG Team Messaging Application (TMA) is a secure, real-time team communication platform designed specifically for GCG Corporation employees. The application provides instant messaging capabilities similar to popular consumer messaging apps like Viber and Messenger, while being fully integrated with the existing GCG Team Management System (TMS) for seamless user authentication and organizational data.

### 1.2 Business Objectives

- **Improve Internal Communication:** Provide employees with a fast, reliable way to communicate with colleagues in real-time
- **Increase Productivity:** Enable quick decisions and information sharing without email delays
- **Enhance Collaboration:** Support both one-on-one and group conversations for team coordination
- **Maintain Security:** Keep all company communications within a controlled, secure environment
- **Leverage Existing Infrastructure:** Integrate with existing TMS user accounts and organizational structure

### 1.3 Target Users

- All GCG Corporation employees across all departments and divisions
- Team leaders managing group communications
- Administrative staff coordinating activities
- Remote and on-site workers requiring instant communication

---

## 2. Product Vision

### 2.1 Vision Statement

To provide GCG employees with a modern, intuitive messaging experience that feels familiar (like Viber/Messenger) while maintaining enterprise-grade security and seamless integration with company systems.

### 2.2 Design Philosophy

- **Familiar Interface:** Viber-inspired purple theme with modern, clean design
- **Instant & Reliable:** Messages delivered in real-time with status indicators
- **Simple to Use:** No training required - works like the messaging apps people already know
- **Always Connected:** Works on desktop browsers with real-time synchronization

---

## 3. Feature Requirements

### 3.1 User Authentication & Access

#### 3.1.1 Single Sign-On (SSO)
- **Requirement:** Users must be able to log in using their existing GCG TMS credentials
- **Benefit:** No need to remember a separate password for the chat application
- **Behavior:**
  - If already logged into TMS, automatically log into chat
  - One account for all GCG applications

#### 3.1.2 User Profile
- **Requirement:** Display user information from TMS including name, photo, position, and department
- **Behavior:**
  - Profile information is read-only (managed through TMS)
  - Shows organizational hierarchy: Division > Department > Section
  - Displays job title and role

### 3.2 Messaging Features

#### 3.2.1 Direct Messages (One-on-One Chat)
- **Requirement:** Users can send private messages to any other employee
- **Behavior:**
  - Search for colleagues by name or email
  - Start a conversation with any employee
  - Messages are private between the two participants only

#### 3.2.2 Group Conversations
- **Requirement:** Users can create group chats with multiple participants
- **Behavior:**
  - Create a group with a custom name
  - Add or remove members (with appropriate permissions)
  - Set a custom group avatar/photo
  - Group admin can manage members

#### 3.2.3 Text Messages
- **Requirement:** Send and receive text messages in real-time
- **Behavior:**
  - Type and send messages instantly
  - See messages appear immediately without page refresh
  - Support for long messages (up to 10,000 characters)

#### 3.2.4 Message Status Indicators
- **Requirement:** Know when messages are sent, delivered, and read
- **Behavior:**
  - Single check mark (✓): Message sent to server
  - Double check mark (✓✓): Message delivered to recipient's device
  - Purple double check mark (✓✓): Message has been read by recipient
  - Status visible on each message

#### 3.2.5 Typing Indicators
- **Requirement:** See when someone is typing a message
- **Behavior:**
  - Shows "User is typing..." when the other person is composing a message
  - Disappears when they stop typing or send the message

#### 3.2.6 Message Editing
- **Requirement:** Users can edit their sent messages
- **Behavior:**
  - Edit own messages after sending
  - Shows "Edited" label on modified messages
  - Other participants see the updated content

#### 3.2.7 Message Deletion
- **Requirement:** Users can delete messages
- **Behavior:**
  - **Delete for Me:** Remove message from your view only
  - **Delete for Everyone:** Remove message for all participants (sender only, within time limit)
  - Deleted messages show "This message was deleted" placeholder

#### 3.2.8 Reply to Messages
- **Requirement:** Reply to specific messages in a conversation
- **Behavior:**
  - Quote and reply to any message
  - Shows the original message being replied to
  - Click on reply to jump to original message

#### 3.2.9 Message Reactions
- **Requirement:** React to messages with emoji
- **Behavior:**
  - Click reaction button to add emoji to any message
  - See who reacted with which emoji
  - Multiple users can react to the same message
  - Remove your own reactions

#### 3.2.10 Message Search
- **Requirement:** Search through message history
- **Behavior:**
  - Search messages by text content
  - See results across all conversations
  - Click result to jump to that message

### 3.3 File Sharing Features

#### 3.3.1 Image Sharing
- **Requirement:** Share images in conversations
- **Behavior:**
  - Upload images from computer
  - Preview images within the chat
  - Click to view full-size image
  - Supported formats: JPEG, PNG, GIF, WebP

#### 3.3.2 File Attachments
- **Requirement:** Share documents and files
- **Behavior:**
  - Upload files up to 100MB
  - Supported types: PDF, Word documents, Excel spreadsheets
  - Download files directly from chat
  - See file name and size

#### 3.3.3 Voice Messages
- **Requirement:** Record and send voice messages
- **Behavior:**
  - Hold button to record (up to 5 minutes)
  - Preview before sending
  - Play voice messages within chat
  - See duration of recording

### 3.4 Poll Feature

#### 3.4.1 Create Polls
- **Requirement:** Create polls to gather team opinions
- **Behavior:**
  - Add a question with 2-10 answer options
  - Choose single choice or multiple choice
  - Set optional expiration time

#### 3.4.2 Vote on Polls
- **Requirement:** Participate in polls
- **Behavior:**
  - Vote for one or more options (based on poll type)
  - See real-time vote counts
  - See who voted for which option
  - Change your vote before poll closes

### 3.5 Online Status & Presence

#### 3.5.1 Online Indicator
- **Requirement:** See who is currently online
- **Behavior:**
  - Green dot on profile picture indicates online status
  - Gray dot or no dot indicates offline
  - Real-time status updates

### 3.6 Conversation Management

#### 3.6.1 Conversation List
- **Requirement:** View all conversations in one place
- **Behavior:**
  - List shows all active conversations
  - Most recent conversations appear at top
  - Shows last message preview
  - Shows unread message count badge

#### 3.6.2 Search Conversations
- **Requirement:** Find specific conversations quickly
- **Behavior:**
  - Search by conversation name or participant name
  - Quick filtering of conversation list

#### 3.6.3 Mute Conversations
- **Requirement:** Silence notifications for specific conversations
- **Behavior:**
  - Mute for a set period or indefinitely
  - Still receive messages, just no notifications
  - Mute icon shown on muted conversations

#### 3.6.4 Leave Conversation
- **Requirement:** Exit group conversations
- **Behavior:**
  - Leave any group you're a member of
  - Other members see "[User] left the conversation"
  - Cannot leave direct message conversations

### 3.7 Notification System

#### 3.7.1 In-App Notifications
- **Requirement:** Receive alerts for new messages while using the app
- **Behavior:**
  - Toast notifications appear for new messages
  - Click notification to go to that conversation
  - Sound plays for new messages (if enabled)

#### 3.7.2 Browser Notifications
- **Requirement:** Receive notifications even when browser tab is not active
- **Behavior:**
  - Desktop notification shows message preview
  - Click to open the app
  - Requires browser permission

#### 3.7.3 Notification Preferences
- **Requirement:** Customize notification behavior
- **Behavior:**
  - Enable/disable notification sounds
  - Adjust notification volume
  - Enable/disable browser notifications
  - Choose notification types (messages, mentions, reactions)
  - Set "Do Not Disturb" hours

### 3.8 System Messages

#### 3.8.1 Activity Messages
- **Requirement:** Show important conversation events
- **Behavior:**
  - "[User] added [New Member] to the group"
  - "[User] removed [Member] from the group"
  - "[User] left the conversation"
  - "[User] changed the group name to [Name]"

---
## 4. Encryption

### 4.1 End-to-End Encryption (E2EE)
- **Requirement:** Encrypt all messages so only participants can read them
- **Benefit:** Enhanced privacy and security for sensitive communications
- **Status:** Planned for future release


## 5. User Interface Requirements

### 5.1 Visual Design

#### 5.1.1 Brand Colors
- **Primary Color:** Purple (#7360F2) - Viber-inspired
- **Online Status:** Green (#10B981)
- **Offline Status:** Gray (#6B7280)
- **Sent Message Bubble:** Purple background
- **Received Message Bubble:** Gray background

#### 5.1.2 Layout
- **Left Panel:** Conversation list (sidebar)
- **Right Panel:** Active chat view
- **Header:** App title and settings
- **Message Input:** Bottom of chat area with attachment buttons

### 5.2 Usability Requirements

- **Responsive Design:** Works on various screen sizes
- **Accessibility:** Usable with keyboard navigation
- **Performance:** Messages appear instantly (no noticeable delay)
- **Reliability:** Works consistently without crashes or freezes

---

## 6. Integration Requirements

### 6.1 TMS Integration
- **Single Sign-On:** Use TMS credentials for login
- **User Directory:** Access all TMS users for messaging
- **Organization Data:** Display user's position, department, division
- **Profile Sync:** Automatically update profile changes from TMS

### 6.2 Media Storage
- **Cloud Storage:** All uploaded files stored securely in cloud
- **CDN Delivery:** Fast loading of images and files globally
- **Retention:** Files stored indefinitely unless deleted

---

## 7. Performance Requirements

| Metric | Requirement |
|--------|-------------|
| Message Delivery | < 1 second (real-time) |
| Page Load Time | < 3 seconds |
| File Upload | Progress indicator shown |
| Search Results | < 2 seconds |
| Online Status Update | Real-time |

---

## 8. Security Requirements

### 8.1 Authentication
- Secure login via TMS SSO
- Session expires after extended inactivity
- One active session per user (optional)

### 8.2 Data Protection
- All data transmitted over HTTPS
- Messages stored securely in database
- File uploads scanned for malware (future)

### 8.3 Access Control
- Users can only see conversations they're part of
- Group admins have member management rights
- Cannot message blocked users

---

## 9. Success Metrics

| Metric | Target |
|--------|--------|
| User Adoption | 80% of employees active within 3 months |
| Daily Active Users | 60% of total users |
| Message Response Time | Average < 5 minutes during work hours |
| User Satisfaction | 4.0+ rating out of 5 |
| System Uptime | 99.9% availability |

---

## 10. Constraints & Limitations

### 10.1 Current Limitations
- Web browser only (no mobile app yet)
- No voice/video calls yet
- Profile management only through TMS
- Maximum file size: 100MB

### 10.2 Browser Support
- Google Chrome (recommended)
- Mozilla Firefox
- Microsoft Edge
- Safari

---

## 11. Glossary

| Term | Definition |
|------|------------|
| DM | Direct Message - private conversation between two users |
| Group | Conversation with 3 or more participants |
| TMS | Team Management System - GCG's employee management platform |
| SSO | Single Sign-On - login once for all applications |
| E2EE | End-to-End Encryption - only sender and recipient can read messages |
| Reaction | Emoji response to a message |
| Poll | Survey question with voting options |

---

## 12. Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | January 23, 2026 | GCG Development Team | Initial document |

---

**Approval Signatures:**

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product Owner | | | |
| Business Stakeholder | | | |
| Technical Lead | | | |
