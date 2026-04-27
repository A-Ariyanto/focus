import { useMemo } from 'react';

const QUOTES = [
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'Focus on being productive instead of busy.', author: 'Tim Ferriss' },
  {
    text: 'It is not enough to be busy. The question is: what are we busy about?',
    author: 'Henry David Thoreau',
  },
  { text: 'Concentrate all your thoughts upon the work at hand.', author: 'Alexander Graham Bell' },
  { text: 'The way to get started is to quit talking and begin doing.', author: 'Walt Disney' },
  { text: 'Do the hard jobs first. The easy jobs will take care of themselves.', author: 'Dale Carnegie' },
  { text: 'Action is the foundational key to all success.', author: 'Pablo Picasso' },
  {
    text: "You don't have to see the whole staircase, just take the first step.",
    author: 'Martin Luther King Jr.',
  },
  { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  {
    text: 'Your future is created by what you do today, not tomorrow.',
    author: 'Robert Kiyosaki',
  },
  { text: 'Discipline is the bridge between goals and accomplishment.', author: 'Jim Rohn' },
  { text: "Don't watch the clock; do what it does. Keep going.", author: 'Sam Levenson' },
];

function getBlockedDomainText() {
  const params = new URLSearchParams(window.location.search);
  const blockedUrl = params.get('url');

  if (!blockedUrl) {
    return null;
  }

  try {
    return new URL(decodeURIComponent(blockedUrl)).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export default function App() {
  const blockedDomain = useMemo(() => getBlockedDomainText(), []);
  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);

  return (
    <>
      <div className="orb orb-violet" />
      <div className="orb orb-cyan" />

      <div className="card">
        <div className="shield">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="url(#g)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <defs>
              <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#a78bfa" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>

        <h1 className="title">Stay Focused</h1>
        <p className="domain">
          {blockedDomain ? (
            <>
              <strong>{blockedDomain}</strong> is blocked
            </>
          ) : (
            'This site is blocked'
          )}
        </p>

        <div className="divider" />

        <p className="quote">"{quote.text}"</p>
        <p className="author">- {quote.author}</p>

        <div className="badge">
          <span className="pulse-dot" />
          Focus Mode Active
        </div>
      </div>
    </>
  );
}
