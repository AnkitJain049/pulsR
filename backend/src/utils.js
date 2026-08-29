/**
 * Utility functions for PULSR Backend
 */

// Generate a 4-character room code format (e.g., "ROOM-A4X9")
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded ambiguous chars like I, O, 0, 1
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `ROOM-${code}`;
}

// Generate random funny usernames (e.g., "Neon Otter 42")
const ADJECTIVES = [
  'Neon', 'Groovy', 'Sonic', 'Pulsing', 'Velvet', 'Cosmic',
  'Turbo', 'Electric', 'Funky', 'Dancing', 'Hyper', 'Glitch',
  'Vibrant', 'Retro', 'Astral', 'Luminous', 'Quantum', 'Wavy'
];

const ANIMALS = [
  'Otter', 'Flamingo', 'Panda', 'Falcon', 'Jaguar', 'Dolphin',
  'Chameleon', 'Penguin', 'Fox', 'Koala', 'Badger', 'Lynx',
  'Raven', 'Gecko', 'Lemur', 'Wombat', 'Octopus', 'Cheetah'
];

export function generateFunnyUsername() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const num = Math.floor(Math.random() * 90) + 10; // 10 - 99
  return `${adj} ${animal} ${num}`;
}

// Generate unique session identifier for clients
export function generateSessionId() {
  return 'sess_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}
