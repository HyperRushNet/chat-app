# HRN Chat 2026 – v1.0.5

A high-security, real-time messaging platform built with modern web technologies.  
Designed with privacy, end-to-end encryption, and resilient session management at its core.

---

## Overview

HRN Chat 2026 is a browser-based encrypted messaging system focused on:

- Strong client-side cryptography  
- Secure room access control  
- Real-time communication  
- Controlled session persistence  
- Offline session continuity  

The architecture prioritizes strict security boundaries between client and server while maintaining a clean and responsive user experience.

---

## Core Features

### Secure Verification
- OTP-based email verification  
- 10-minute real-time expiration countdown  
- Server-validated verification flow  

### End-to-End Encryption (E2EE)
- AES-256-GCM encryption  
- PBKDF2 key derivation (300,000 iterations, SHA-256)  
- Per-room unique salt  
- Client-side encryption before database insertion  
- Base64(IV + Ciphertext) storage format  
- Web Worker offloading for cryptographic operations  

### Session & Access Control
- Offline session continuity for previously authenticated devices  
- JWT expiration enforced locally  
- Single active session per browser context (Master Tab logic)  
- Resolved soft-logout issues preventing unintended auto-relogin on tab focus  

### Channel Management
- Public or private rooms  
- Optional password protection  
- Server-side blind verification  
- Password hashes never exposed to the client  

### Database Security
- Row Level Security (RLS) enforced at database level  
- Guests restricted from creating rooms  
- Access rules validated server-side  

### Real-Time Engine
- Supabase Realtime (Postgres Changes)  
- Instant message synchronization  
- Automatic presence recovery on reconnect  
- Live online user count (room-level and global)  

### Offline Support
- Access cached chats and rooms while offline  
- Read previously synchronized encrypted messages  
- Login available on previously authenticated devices within valid session window  

### Message Features
- Secure message editing  
- Message deletion  
- Clipboard copy support  
- Smart sticky date labels:
  - Today  
  - Yesterday  
  - Weekday  
  - Full date  

### User Interface
- Minimalist iOS-inspired design  
- Plus Jakarta Sans typography  
- Inline SVG icons  
- Optimized rendering and smooth animations  

---

## Security Architecture

### Encryption Model
- Client-side encryption using Web Crypto API  
- AES-GCM for authenticated encryption  
- PBKDF2 (SHA-256) with 300,000 iterations  
- Per-room salt isolation  
- No plaintext messages stored server-side  

### Room Protection
- Password validation performed server-side  
- SHA-256 hashing with unique salt  
- No password hash leakage to clients  

### Session Design
- Persistent authenticated session stored in browser  
- JWT expiration respected locally  
- Offline access permitted only within valid session window  
- Master Tab logic prevents multi-tab session conflicts  

### Rate Limiting
- Client-side rate limit: 1 message per second  
- Implemented primarily as a UX throttling mechanism  

### Concurrency Target
- Presence-based target capacity: 150 concurrent users  

---

## Tech Stack

### Frontend
- GitHub Pages  
- HTML5  
- CSS3  
- JavaScript (ES6 Modules)  

### Backend / Infrastructure
- Supabase  
  - PostgreSQL  
  - Authentication  
  - Realtime  
  - RPC  
  - Row Level Security  

### Email Verification
- Vercel Functions (API layer)  
- Google Apps Script (OTP mail delivery)  

### Cryptography
- Web Crypto API  
  - PBKDF2  
  - AES-GCM  
  - SHA-256  

---

## Deployment Workflow

### 1. Frontend
Push HTML/CSS/JS to GitHub Pages to serve the client interface.

### 2. Email Verification
Vercel Function triggers Google Apps Script to deliver OTP emails.

### 3. Database & Backend
Supabase manages:
- User authentication  
- Room creation and access control  
- Encrypted message storage  
- Row Level Security enforcement  

### 4. Real-Time Messaging
Supabase Realtime listens to Postgres changes and synchronizes clients instantly.

---

## Data Storage Format

Encrypted messages are stored as:

Base64(IV + Ciphertext)

Where:
- IV = Initialization Vector  
- Ciphertext = AES-GCM encrypted payload  

No plaintext message content is stored in the database.

---

## Configuration & Limits

- Target Concurrent Users: 150  
- Client Rate Limit: 1 message per second  
- Encryption: AES-256-GCM  
- PBKDF2 Iterations: 300,000  
- OTP Expiry: 10 minutes  

---

## License

MIT License
