/**
 * blocked.js — Companion script for Focus blocked page.
 *
 * Reads the blocked URL from query params and displays:
 *   - The blocked domain name
 *   - A random motivational quote
 */

const QUOTES = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "It is not enough to be busy. The question is: what are we busy about?", author: "Henry David Thoreau" },
  { text: "Concentrate all your thoughts upon the work at hand.", author: "Alexander Graham Bell" },
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { text: "Do the hard jobs first. The easy jobs will take care of themselves.", author: "Dale Carnegie" },
  { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { text: "You don't have to see the whole staircase, just take the first step.", author: "Martin Luther King Jr." },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Your future is created by what you do today, not tomorrow.", author: "Robert Kiyosaki" },
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
];

// Parse query params
const params = new URLSearchParams(window.location.search);
const blockedUrl = params.get('url');

// Show domain
if (blockedUrl) {
  try {
    const hostname = new URL(decodeURIComponent(blockedUrl)).hostname.replace(/^www\./, '');
    document.getElementById('domain-text').innerHTML =
      '<strong>' + hostname + '</strong> is blocked';
  } catch {
    document.getElementById('domain-text').textContent = 'This site is blocked';
  }
}

// Show random quote
const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
document.getElementById('quote-text').textContent = '\u201c' + q.text + '\u201d';
document.getElementById('quote-author').textContent = '\u2014 ' + q.author;
