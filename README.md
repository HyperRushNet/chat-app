# HRN Chat 2026 - v1.0.2 - Security & UI Update

A high-security, real-time messaging interface built with modern web technologies. This project focuses on privacy, end-to-end encryption, and a seamless user experience.

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

## Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+ Modules)  
- **Database & Auth**: Supabase (PostgreSQL, Auth, Realtime, RPC)  
- **Encryption**: Web Crypto API (PBKDF2, AES-GCM, SHA-256)  
- **Icons**: Lucide  

## Configuration & Capacity

- **User Limit**: 475 concurrent users (Presence-based check).  
- **Room Security**: Optional password protection (SHA-256 hash + unique salt).  
- **Message Storage**: Client-side encrypted, formatted as Base64(IV + Ciphertext).  
- **Rate Limiting**: 1 message per second (Client-side enforced).  
- **Performance**: Web Worker used for crypto operations to prevent UI blocking.
