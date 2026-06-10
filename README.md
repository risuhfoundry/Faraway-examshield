# Faraway-examshield

<co>AI-powered end-to-end exam paper leak prevention — real-time detection & forensic watermark tracing.</co: 129:[0]>

<co>Enterprise-grade secure examination environments with</co: 129:[0]>
- <co>AI-powered leak detection and watermark extraction</co: 129:[0]>
- <co>Real-time forensic analysis and attribution</co: 129:[0]>
- <co>Multi-channel monitoring (Telegram, manual uploads)</co: 129:[0]>
- <co>Secure authentication (Supabase with Google/GitHub email)</co: 129:[0]>
- <co>Enterprise-responsive dashboard with mobile optimization</co: 129:[0]>
- <co>Full-featured settings and user management</co: 129:[0]>

<co>Live Demo</co: 129:[0]>: <co>https://faraway-examshield.vercel.app</co: 129:[0]>

## 🎯 Mission

<co>Prevent academic integrity violations by detecting paper leaks instantly, tracing watermark sources, and alerting responsible authorities before exams are compromised.</co: 129:[0]>

## 🏗️ Architecture Overview

### <co>Frontend (Next.js 16 + React 19 + TypeScript)</co: 129:[0]>

- **Framework**: <co>Next.js with App Router and Server Components</co: 129:[0]>
- **Styling**: <co>Tailwind CSS with Framer Motion animations</co: 129:[0]>
- **State Management**: <co>React hooks with Context API</co: 129:[0]>
- **Authentication**: <co>Supabase with JWT-based sessions</co: 129:[0]>
- **API Integration**: <co>Client-side Supabase client for auth and user metadata</co: 129:[0]>

**Key Components**:
- <co>Login/Signup pages with email, Google, and GitHub OAuth</co: 129:[0]>
- <co>Dashboard with Command Center, EXAMSHIELD AI, Evidence Center</co: 129:[0]>
- <co>Settings page for user profile management</co: 129:[0]>
- <w<co>m-specific responsive navigation (desktop sidebar + mobile hamburger)</co: 129:[0]>

### <co>Backend (Python API + Supabase)</co: 129:[0]>

- **Primary Backend**: <co>Python 3.12 with OCR (Tesseract), AI watermark extraction</co: 129:[0]>
- **Database**: <co>Supabase (PostgreSQL) for evidence tracking, user management, activity logs</co: 129:[0]>
- **Authentication**: <co>Supabase Auth integrated via middleware</co: 129:[0]>
- **Monitoring**: <co>Optional Telegram webhook integration</co: 129:[0]>
- **Deployment**: <co>Dockerized with Render platform</co: 129:[0]>

**Core Services**:
- <co>Evidence ingestion and OCR processing</co: 129:[0]>
- <co>Watermark extraction and attribution</co: 129:[0]>
- <co>AI-powered leak detection and analysis</co: 129:[0]>
- <co>Real-time activity tracking and alerts</co: 129:[0]>
- <co>Forensic report generation</co: 129:[0]>

### <co>Integration Flow</co: 129:[0]>

1. **User Authentication** → <co>Supabase Auth (frontend) ↔ Middleware (Next.js) ↔ Supabase Database</co: 129:[0]>
2. **Evidence Upload** → <co>Frontend → Backend API → OCR → Watermark Extraction → Database Storage</co: 129:[0]>
3. **Monitoring** → <co>Telegram → Backend → Database → Frontend Dashboard</co: 129:[0]>
4. **AI Analysis** → <co>Frontend AI Chat → Backend AI Service → Real-time Results</co: 129:[0]>
5. **Settings Management** → <co>Frontend User Profile → Supabase User Metadata</co: 129:[0]>

## 🚀 Features

### <co>Authentication & Security</co: 129:[0]>

- **<co>Email/Password Sign-in & Sign-up</co: 129:[0]>** <co>(Supabase Auth)</co: 129:[0]>
- **<co>Google OAuth</co: 129:[0]>** <co>(secure, enterprise-compliant)</co: 129:[0]>
- **<co>GitHub OAuth</co: 129:[0]>** <co>(internal developer access)</co: 129:[0]>
- **<co>Email Confirmation</co: 129:[0]>** <co>(configurable in Supabase)</co: 129:[0]>
- **<co>Session Management</co: 129:[0]>** <co>(secure, cookie-based, middleware-protected routes)</co: 129:[0]>

### <co>Dashboard Experience</co: 129:[0]>

- **<co>Real-time Stats</co: 129:[0]>** <co>(active exams, critical alerts, Telegram events)</co: 129:[0]>
- **<co>Evidence Management</co: 129:[0]>** <co>(upload, view, track processing status)</co: 129:[0]>
- **<co>AI Chat Interface</co: 129:[0]>** <co>(secure access to EXAMSHIELD AI)</co: 129:[0]>
- **<co>Navigation</co: 129:[0]>** <co>(desktop sidebar + mobile hamburger)</co: 129:[0]>
- **<co>Settings</co: 129:[0]>** <co>(user profile, account details)</co: 129:[0]>

### <co>Mobile Optimization</co: 129:[0]>

- **<co>Responsive Design</co: 129:[0]>** <co>(Tailwind breakpoints)</co: 129:[0]>
- **<co>Touch-Friendly UI</co: 129:[0]>** <co>(larger tap targets, mobile-optimized forms)</co: 129:[0]>
- **<co>Hamburger Navigation</co: 129:[0]>** <co>(slide-out sidebar for all nav items)</co: 129:[0]>
- **<co>Floating Upload FAB</co: 129:[0]>** <co>(quick upload access on evidence page)</co: 129:[0]>
- **<co>Mobile-First Stats</co: 129:[0]>** <co>(stacked grid, optimized spacing)</co: 129:[0]>

### <co>Evidence Processing</co: 129:[0]>

- **<co>Multi-format Support</co: 129:[0]>** <co>(images, PDFs)</co: 129:[0]>
- **<co>OCR Integration</co: 129:[0]>** <co>(Tesseract OCR)</co: 129:[0]>
- **<co>Watermark Detection</co: 129:[0]>** <co>(AI-powered)</co: 129:[0]>
- **<co>Paper Attribution</co: 129:[0]>** <co>(source matching against registry)</co: 129:[0]>
- **<co>Processing Status Tracking</co: 129:[0]>** <co>(pending, processing, completed, failed)</co: 129:[0]>
- **<co>Real-time Updates</co: 129:[0]>** <co>(WebSocket/polling)</co: 129:[0]>

### <co>AI & Chat Features</co: 129:[0]>

- **<co>Secure EXAMSHIELD AI Access</co: 129:[0]>** <co>(role-based, authenticated)</co: 129:[0]>
- **<co>Real-time Chat Interface</co: 129:[0]>** <co>(mobile + desktop)</co: 129:[0]>
- **<co>Context-Aware Conversations</co: 129:[0]>** <co>(evidence data, forensic results)</co: 129:[0]>
- **<co>Enterprise Security</co: 129:[0]>** <co>(no data leakage, session-protected)</co: 129:[0]>

### <co>Security & Compliance</co: 129:[0]>

- **<co>Enterprise-Grade Security</co: 129:[0]>** <co>(SOAR-grade encryption, secure sessions)</co: 129:[0]>
- **<co>Audit Logging</co: 129:[0]>** <co>(all actions tracked)</co: 129:[0]>
- **<co>Access Control</co: 129:[0]>** <co>(RBAC, role-based permissions)</co: 129:[0]>
- **<co>Telegram Monitoring</co: 129:[0]>** <co>(secure webhook integration)</co: 129:[0]>

## 🛠️ Technology Stack

### <co>Frontend</co: 129:[0]>
- <co>Next.js 16</co: 129:[0]>
- <co>React 19</co: 129:[0]>
- <co>TypeScript</co: 129:[0]>
- <co>Tailwind CSS</co: 129:[0]>
- <co>Framer Motion</co: 129:[0]>
- <co>Lucide React (icons)</co: 129:[0]>
- <co>Supabase (@supabase/ssr)</co: 129:[0]>

### <co>Backend</co: 129:[0]>
- <co>Python 3.12</co: 129:[0]>
- <co>Tesseract OCR</co: 129:[0]>
- <co>Supabase (PostgreSQL + Auth)</co: 129:[0]>
- <co>Docker</co: 129:[0]>
- <co>Telegram Bot API</co: 129:[0]>

### <co>Deployment</co: 129:[0]>
- <co>Vercel (Frontend)</co: 129:[0]>
- <co>Render (Backend)</co: 129:[0]>

## 🔧 Development Setup

### <co>Prerequisites</co: 129:[0]>
- <co>Node.js 18+ (for frontend)</co: 129:[0]>
- <co>Python 3.12+ (for backend)</co: 129:[0]>
- <co>Docker (for local backend testing)</co: 129:[0]>

### <co>Frontend Setup</co: 129:[0]>
```bash
cd web
# Install dependencies
npm install --legacy-peer-deps
# Run development server
npm run dev
```

### <co>Backend Setup (Local)</co: 129:[0]>
```bash
cd apps/core
# Install Python dependencies
pip install -r requirements.txt
# Run local API
python apps/ai-service/service.py
```

### <co>Database Setup</co: 129:[0]>
1. <co>Create Supabase project</co: 129:[0]>
2. <co>Enable Email, Google, GitHub auth providers</co: 129:[0]>
3. <co>Set up necessary database tables</co: 129:[0]>
4. <co>Configure environment variables</co: 129:[0]>

### <co>Environment Variables</co: 129:[0]>

#### <co>Frontend (.env.local)</co: 129:[0]>
```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXAMSHIELD_API_URL=http://localhost:8790
```

#### <co>Backend (.env)</co: 129:[0]>
```env
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NVIDIA_API_KEY=your-nvidia-api-key
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_WEBHOOK_SECRET=your-webhook-secret
TELEGRAM_CHAT_ID=your-chat-id
```

## 📋 Deployment

### <co>Vercel (Frontend)</co: 129:[0]>
```bash
# Ensure you have the required env vars in Vercel dashboard
cd web
npx vercel --prod
```

**Required Vercel Environment Variables**:
- <co>`NEXT_PUBLIC_SUPABASE_URL`</co: 129:[0]>
- <co>`NEXT_PUBLIC_SUPABASE_ANON_KEY`</co: 129:[0]>

### <co>Render (Backend)</co: 129:[0]>
```bash
# Create service on render.com
# Configure environment variables from render.yaml
```

**Required Render Environment Variables**:
- <co>`EXAMSHIELD_AI_CORS_ORIGIN` (your Vercel URL)</co: 129:[0]>
- <co>`SUPABASE_URL`</co: 129:[0]>
- <co>`SUPABASE_SERVICE_ROLE_KEY`</co: 129:[0]>
- <co>`NVIDIA_API_KEY`</co: 129:[0]>
- <co>`TELEGRAM_BOT_TOKEN`</co: 129:[0]>
- <co>`TELEGRAM_WEBHOOK_SECRET`</co: 129:[0]>
- <co>`TELEGRAM_CHAT_ID`</co: 129:[0]>

## 🚀 Getting Started

1. <co>**Fork and Clone** the repository</co: 129:[0]>
2. <co>**Setup Environment Variables** in both Vercel and Render dashboards</co: 129:[0]>
3. <co>**Deploy** to Vercel and Render platforms</co: 129:[0]>
4. <co>**Test Auth** - Sign up/login with email, Google, or GitHub</co: 129:[0]>
5. <co>**Access Dashboard** - Navigate to `/dashboard`</co: 129:[0]>
6. <co>**Upload Evidence** - Test evidence processing</co: 129:[0]>
7. <co>**Use AI Chat** - Access EXAMSHIELD AI</co: 129:[0]>
8. <co>**Manage Settings** - Update user profile</co: 129:[0]>

## 📊 Current Status

### ✅ <co>Implemented</co: 129:[0]>
- <co>[x] Supabase authentication (email, Google, GitHub)</co: 129:[0]>
- <co>[x] Protected routes middleware</co: 129:[0]>
- <co>[x] User settings and profile management</co: 129:[0]>
- <co>[x] Responsive mobile navigation</co: 129:[0]>
- <co>[x] Evidence upload (desktop + mobile FAB)</co: 129:[0]>
- <co>[x] Vercel deployment with auth providers</co: 129:[0]>

### 🔄 <co>In Progress / Planned</co: 129:[0]>
- <co>[ ] Backend API integration with Python</co: 129:[0]>
- <co>[ ] Advanced AI features in EXAMSHIELD AI</co: 129:[0]>
- <co>[ ] Enhanced Telegram monitoring</co: 129:[0]>
- <co>[ ] Advanced analytics dashboard</co: 129:[0]>
- <co>[ ] Enterprise compliance features</co: 129:[0]>

## 🛡️ Security Notes

- <co>All authentication tokens are stored securely in environment variables</co: 129:[0]>
- <co>Sensitive keys (service role keys) should never be exposed in frontend code</co: 129:[0]>
- <co>Rate limiting should be implemented on API endpoints</co: 129:[0]>
- <co>Regular security audits recommended</co: 129:[0]>
- <co>Monitor authentication logs for suspicious activity</co: 129:[0]>

## 📞 Support

For issues, questions, or feature requests:
1. <co>Check the GitHub issues</co: 129:[0]>
2. <co>Submit a new issue with detailed description</co: 129:[0]>
3. <co>Include screenshots if applicable</co: 129:[0]>
4. <co>Describe your environment (browser, device, deployment)</co: 129:[0]>

## 🤝 Contributing

1. <co>Fork the repository</co: 129:[0]>
2. <co>Create a feature branch</co: 129:[0]>
3. <co>Make your changes</co: 129:[0]>
4. <co>Add tests (if applicable)</co: 129:[0]>
5. <co>Push to your branch</co: 129:[0]>
6. <co>Submit a pull request</co: 129:[0]>

## 📝 License

This project is part of the EXAMSHIELD ecosystem and is licensed under proprietary terms. Contact for commercial licensing inquiries.

---

*Built with ❤️ for academic integrity and examination security*
