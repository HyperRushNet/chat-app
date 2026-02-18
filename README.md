# HyperRush Chat App

A secure, real-time messaging application built with Supabase and modern web technologies.

<p align="left">
  <img src="https://img.shields.io/badge/version-1.0.1-blue">
  <img src="https://img.shields.io/badge/encryption-AES--GCM-green">
  <img src="https://img.shields.io/badge/backend-Supabase-3ECF8E">
  <img src="https://img.shields.io/badge/license-MIT-lightgrey">
</p>

---

## Overview

HyperRush Chat App is a lightweight real-time messaging platform focused on privacy, cryptographic isolation, and performance.  
The project follows a branch-based versioning model to preserve release history and architectural evolution.

---

## Features

- End-to-end encryption using AES-GCM
- Real-time messaging via Supabase Realtime
- OTP-based authentication
- Per-room unique cryptographic salt
- Device-based rate limiting
- Single active session enforcement
- Minimal metadata storage

---

## Screenshots

<p align="left">
  <a href="https://raw.githubusercontent.com/HyperRushNet/chat-app/refs/heads/main/screenshot-1.webp">
    <img src="https://raw.githubusercontent.com/HyperRushNet/chat-app/refs/heads/main/screenshot-1.webp" width="220" style="margin-right: 15px;">
  </a>
  <a href="https://raw.githubusercontent.com/HyperRushNet/chat-app/refs/heads/main/screenshot-2.webp">
    <img src="https://raw.githubusercontent.com/HyperRushNet/chat-app/refs/heads/main/screenshot-2.webp" width="220" style="margin-right: 15px;">
  </a>
  <a href="https://raw.githubusercontent.com/HyperRushNet/chat-app/refs/heads/main/screenshot-3.webp">
    <img src="https://raw.githubusercontent.com/HyperRushNet/chat-app/refs/heads/main/screenshot-3.webp" width="220">
  </a>
</p>

---

## Architecture

Frontend: Vanilla JavaScript with modern Web APIs  
Backend: Supabase (Auth, Realtime, Postgres)  
Encryption: AES-256-GCM via Web Crypto API  

Security principles:

- No plaintext message storage
- Cryptographic isolation per room
- Device-based abuse mitigation
- Minimal retained metadata

---

## License

This project is licensed under the MIT License.
