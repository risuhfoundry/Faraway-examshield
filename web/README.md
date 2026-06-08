# EXAMSHIELD Web

Next.js operations dashboard for evidence intake, forensic attribution, alerts, and the EXAMSHIELD AI client.

## EXAMSHIELD AI

The AI page talks to the standalone Python AI service at `http://127.0.0.1:8790` by default.

Start the AI service:

```powershell
cd ..\apps\ai-service
$env:NVIDIA_API_KEY="your-nvidia-api-key"
$env:NVIDIA_NIM_MODEL="nvidia/llama-3.1-nemotron-nano-8b-v1"
python service.py
```

Optional:

```powershell
$env:NVIDIA_NIM_BASE_URL="https://integrate.api.nvidia.com/v1"
$env:NEXT_PUBLIC_EXAMSHIELD_AI_SERVICE_URL="http://127.0.0.1:8790"
```

Do not commit `.env.local` or API keys. The Python service can still stream a local threat snapshot without a NIM key.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
