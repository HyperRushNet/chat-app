# HRN Chat 2026 - v1.0.4

A high-security, real-time messaging interface built with modern web technologies.  
Focuses on privacy, end-to-end encryption, and a seamless user experience.

---

## Features

- **Secure Verification**: OTP-based verification with real-time expiry countdown (10 minutes).  
- **Privacy First**: End-to-end encryption (E2EE) for all chats using AES-256-GCM with PBKDF2 (300k iterations) and a per-room unique salt.  
- **Real-time Engine**: Instant messaging via Supabase Realtime (Postgres Changes).  
- **Advanced Session Management**:
  - Single active session per browser context (Master Tab logic).  
  - Resolved soft-logout bugs to prevent auto-relogin on tab focus.  
- **Channel Management**: Public or private rooms with optional password protection.  
- **Security Architecture**:
  - Blind Verification: Room passwords are verified server-side; hashes are never exposed to the client.  
  - Row Level Security: Database-enforced permissions prevent guests from creating rooms.  
- **Connectivity Monitoring**: Detects connection loss and syncs presence automatically on reconnect.  
- **Modern UI**: Minimalist iOS-inspired design with Plus Jakarta Sans font and Lucide icons.  
- **Smart Date Labels**: Sticky dividers for "Today", "Yesterday", weekdays, and full dates.  
- **Live Presence Count**: Shows online users per room and globally.  
- **Message Actions**: Delete, edit, copy messages securely.

---

## Tech Stack

- **Frontend**: GitHub Pages (HTML5, CSS3, JavaScript ES6 Modules)  
- **Backend / Storage**: Supabase (PostgreSQL, Auth, Realtime, RPC)  
- **Email Verification**:
  - API: Vercel Functions  
  - Mail Sending: Google Apps Script (handles OTP emails)  
- **Encryption**: Web Crypto API (PBKDF2, AES-GCM, SHA-256)  
- **Icons**: Lucide  

---

## Deployment & Workflow

1. **Frontend**:  
   Push HTML/CSS/JS to GitHub Pages → serves UI to clients.

2. **Email Verification**:  
   Vercel Functions trigger Google Apps Script to send OTP verification emails.

3. **Database / Backend**:  
   Supabase handles:
   - User accounts and authentication
   - Rooms (public/private)
   - Client-side encrypted messages
   - Access control via RLS and server-side password checks

4. **Realtime Messaging**:  
   Supabase Realtime listens to Postgres Changes and updates clients instantly.

5. **Security & Performance**:  
   - End-to-end encrypted messages with AES-256-GCM  
   - Web Worker used for heavy crypto operations  
   - Rate limit: 1 message/sec (client-side enforced)  
   - Single active session per browser tab (Master Tab logic)  

---

## Configuration & Capacity

- **Max Concurrent Users**: 150 (presence-based check)  
- **Message Storage**: Base64(IV + Ciphertext), client-side encrypted  
- **Room Security**: Optional password protection, SHA-256 + unique salt  
- **Rate Limiting**: 1 message per second  
- **UI Optimizations**: Minimalist iOS-style, smooth animations, sticky date labels

---

## License

MIT License
