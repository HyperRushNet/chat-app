# HyperRush Chat App

A privacy-engineered real-time messaging system built on Supabase and modern Web APIs.

<p align="left">
  <img src="https://img.shields.io/badge/version-1.0.3-blue">
  <img src="https://img.shields.io/badge/encryption-AES--GCM-green">
  <img src="https://img.shields.io/badge/backend-Supabase + Google Apps Script + Vercel-3ECF8E">
  <img src="https://img.shields.io/badge/license-MIT-lightgrey">
</p>

---

## Executive Summary

HyperRush Chat App is a lightweight real-time communication platform designed with security, isolation, and architectural discipline as first-class concerns.

The system minimizes trust boundaries, reduces metadata exposure, and enforces predictable session behavior.  
Each release is preserved in a dedicated branch to maintain architectural clarity and historical traceability.

---

## Design Objectives

- Strong client-side encryption with authenticated integrity
- Deterministic real-time synchronization
- Strict session control
- Controlled abuse surface
- Minimal persistent data exposure

---

## Core Capabilities

- End-to-end encryption using AES-256-GCM (Web Crypto API)
- Real-time synchronization via Supabase Realtime channels
- OTP-based authentication workflow
- Per-room cryptographic salt isolation
- Device-based rate limiting strategy
- Single active session enforcement
- Minimal metadata retention model

---

## Architecture Overview

### Client Layer
Vanilla JavaScript leveraging modern Web APIs, including the Web Crypto API for authenticated encryption and secure key handling.

### Backend Layer
Supabase stack:
- Authentication
- Realtime engine
- PostgreSQL storage

### Cryptographic Model
- AES-256-GCM for authenticated encryption
- Per-room salt derivation to prevent cross-room cryptographic linkage
- No plaintext message persistence
- Authenticated encryption to prevent tampering

---

## Security Model

The system follows a constrained-trust architecture:

- Message content is encrypted before transmission
- No plaintext storage in persistent layers
- Logical cryptographic isolation between communication rooms
- Controlled concurrent session enforcement
- Device-scoped rate limiting to reduce abuse vectors
- Reduced metadata footprint by default

This project is not positioned as a replacement for enterprise-grade audited systems, but as a disciplined implementation of privacy-first architectural principles.

---

## Screenshots (v1.0.1)

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

## Versioning Strategy

The repository follows a branch-based release model.

Each major version is preserved in a dedicated branch to:
- Maintain architectural consistency
- Prevent regression contamination
- Preserve historical security decisions

---

## License

Released under the MIT License.
