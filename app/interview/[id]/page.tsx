'use client';

import InterviewPageClient from './InterviewPageClient'; // move all your current code into this client component

interface InterviewPageProps {
  params: { id: string };
}

// ✅ Force dynamic rendering to prevent build errors
export const dynamic = 'force-dynamic';
export const dynamicParams = true;

export default function InterviewPage({ params }: InterviewPageProps) {
  // Just render the client component, pass params
  return <InterviewPageClient params={params} />;
}
