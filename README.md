# HRN Chat 2026

A high-security, real-time messaging interface built with modern web technologies. This project focuses on privacy, encryption, and a seamless user experience.

## Features

- **Secure Verification**: Reliable OTP verification with a real-time expiry countdown and attempt limits.
- **Privacy First**: Messages are encrypted using AES-256 before leaving the client.
- **Real-time Engine**: Instant messaging powered by Supabase Realtime.
- **Channel Management**: Create public or private channels with optional access keys.
- **Connectivity Monitoring**: Intelligent overlay detects connection loss and synchronizes automatically upon reconnection.
- **Modern UI**: Minimalist design utilizing Plus Jakarta Sans and Lucide icons.

## Tech Stack

* **Frontend**: HTML5, CSS3, JavaScript (ES6+)
* **Database & Auth**: Supabase
* **Encryption**: CryptoJS
* **Icons**: Lucide

## Security

The application uses a global salt for hashing passwords and room keys. Database records for messages are stored in an encrypted format, requiring the specific room context and internal keys for decryption.

## Mobile Optimization

The interface is fully responsive and optimized for mobile devices, including viewport-fit support for modern displays and touch-optimized interaction elements.

---
*HRN Network - 2026*
