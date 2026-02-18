# HRN Chat 2026 - v1.0

A high-security, real-time messaging interface built with modern web technologies. This project focuses on privacy, end-to-end encryption, and a seamless user experience.

## Features

- Secure Verification: OTP-based verification with real-time expiry countdown.
- Privacy First: E2EE for all chats, per-room unique salt.
- Real-time Engine: Instant messaging via Supabase Realtime.
- Single Session per Account: Only one active session allowed; new logins are kicked.
- Channel Management: Public or private rooms, optional password.
- Connectivity Monitoring: Detects connection loss and syncs on reconnect.
- Modern UI: Minimalist design with Plus Jakarta Sans and Lucide icons.
- Smart Date Labels: Today, Yesterday, Weekday, Full Date dividers.
- Guests: Anonymous login with limited features.

## Tech Stack

- Frontend: HTML5, CSS3, JavaScript (ES6+)
- Database & Auth: Supabase
- Encryption: Web Crypto API (PBKDF2 300k, AES-GCM, per-room salt)
- Icons: Lucide

## Configuration & Capacity

- User Limit: 475 concurrent users
- Room Security: Optional hashed passwords + room salt
- Message Storage: Client-side encrypted, base64(IV + ciphertext)
- Rate Limiting: 1 message per second

*HRN Network – 2026*
