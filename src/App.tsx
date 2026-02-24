/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Shield, 
  Zap, 
  Trophy, 
  Info, 
  Gamepad2, 
  Skull, 
  Star,
  ChevronRight,
  Heart,
  Target
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Sound Manager (Procedural) ---

class SoundManager {
  private ctx: AudioContext | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume: number, slide = 0) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (slide !== 0) {
      osc.frequency.exponentialRampToValueAtTime(freq + slide, this.ctx.currentTime + duration);
    }

    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playShoot() {
    this.playTone(440, 'triangle', 0.1, 0.05, -200);
  }

  playExplosion(isHeavy = false) {
    this.playTone(isHeavy ? 100 : 200, 'sawtooth', isHeavy ? 0.5 : 0.3, 0.15, -80);
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * (isHeavy ? 0.5 : 0.2);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + (isHeavy ? 0.5 : 0.2));
    noise.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noise.start();
  }

  playPowerUp() {
    this.playTone(523.25, 'sine', 0.1, 0.1, 500);
    setTimeout(() => this.playTone(659.25, 'sine', 0.1, 0.1, 500), 50);
    setTimeout(() => this.playTone(783.99, 'sine', 0.2, 0.1, 500), 100);
  }

  playLevelUp() {
    this.playTone(200, 'square', 0.5, 0.1, 1000);
  }
}

const sounds = new SoundManager();

// --- Types & Constants ---

type GameState = 'START' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'LEVEL_COMPLETE';
type Difficulty = 'EASY' | 'NORMAL' | 'HARD';

interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  icon: React.ReactNode;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
  glow: boolean;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  power: number;
  color: string;
  isEnemy?: boolean;
}

interface Enemy {
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  speed: number;
  type: 'basic' | 'fast' | 'heavy';
  color: string;
  scoreValue: number;
  lastShot: number;
}

interface PowerUp {
  x: number;
  y: number;
  type: 'triple' | 'shield';
  color: string;
  size: number;
}

const COLORS = {
  PLAYER: '#00f2ff',
  BASIC: '#ff3e3e',
  FAST: '#ffea00',
  HEAVY: '#ff00ff',
  TRIPLE: '#00ff00',
  SHIELD: '#0088ff',
  BULLET: '#ffffff',
  STAR: '#ffffff',
  NEBULA: ['#1a0b2e', '#0b1a2e', '#2e0b1a'],
};

// --- Asset Paths (Change these to your local PNG paths) ---
const ASSETS = {
  PLAYER: '/assets/player.png',
  ENEMY_BASIC: '/assets/enemy_basic.png',
  ENEMY_FAST: '/assets/enemy_fast.png',
  ENEMY_HEAVY: '/assets/enemy_heavy.png',
  POWERUP_TRIPLE: '/assets/powerup_triple.png',
  POWERUP_SHIELD: '/assets/powerup_shield.png',
};

// --- Helper Functions ---

const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;

// --- Main Component ---

export default function App() {
  const [gameState, setGameState] = useState<GameState>('START');
  const [difficulty, setDifficulty] = useState<Difficulty>('NORMAL');
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [health, setHealth] = useState(3);
  const [timeLeft, setTimeLeft] = useState(45);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});

  const [achievements, setAchievements] = useState<Achievement[]>([
    { id: 'first_blood', title: '第一滴血', description: '击毁第一架敌机', unlocked: false, icon: <Skull className="w-5 h-5" /> },
    { id: 'survivor', title: '生存者', description: '达到第3关', unlocked: false, icon: <Heart className="w-5 h-5" /> },
    { id: 'power_hungry', title: '火力全开', description: '拾取三向子弹道具', unlocked: false, icon: <Zap className="w-5 h-5" /> },
    { id: 'shield_master', title: '铜墙铁壁', description: '使用能量护盾抵挡攻击', unlocked: false, icon: <Shield className="w-5 h-5" /> },
    { id: 'ace_pilot', title: '王牌飞行员', description: '分数超过5000', unlocked: false, icon: <Target className="w-5 h-5" /> },
  ]);

  // --- Image Preloading ---
  useEffect(() => {
    const loadImages = async () => {
      const promises = Object.entries(ASSETS).map(([key, src]) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.src = src;
          img.onload = () => {
            imagesRef.current[key] = img;
            resolve(true);
          };
          img.onerror = () => {
            console.warn(`Failed to load image: ${src}. Falling back to vector graphics.`);
            resolve(false);
          };
        });
      });
      await Promise.all(promises);
      setImagesLoaded(true);
    };
    loadImages();
  }, []);

  const [lastAchievement, setLastAchievement] = useState<Achievement | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(null);
  
  // Game Entities Refs
  const playerRef = useRef({ x: 0, y: 0, w: 60, h: 60, invul: 0, shield: false, triple: 0 });
  const bulletsRef = useRef<Bullet[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const starsRef = useRef<{x: number, y: number, s: number, alpha: number}[]>([]);
  const nebulaeRef = useRef<{x: number, y: number, r: number, color: string}[]>([]);
  const keysRef = useRef<Record<string, boolean>>({});
  const lastShotRef = useRef(0);
  const shakeRef = useRef(0);

  // --- Achievement Logic ---

  const unlockAchievement = useCallback((id: string) => {
    setAchievements(prev => {
      const index = prev.findIndex(a => a.id === id);
      if (index !== -1 && !prev[index].unlocked) {
        const newArr = [...prev];
        newArr[index] = { ...newArr[index], unlocked: true };
        setLastAchievement(newArr[index]);
        setTimeout(() => setLastAchievement(null), 3000);
        return newArr;
      }
      return prev;
    });
  }, []);

  // --- Game Initialization ---

  const initGame = (diff?: Difficulty) => {
    sounds.init();
    if (diff) setDifficulty(diff);
    setScore(0);
    setLevel(1);
    setHealth(3);
    setTimeLeft(45);
    setGameState('PLAYING');
    
    const canvas = canvasRef.current;
    if (canvas) {
      playerRef.current = { 
        x: canvas.width / 2, 
        y: canvas.height - 80, 
        w: 60, 
        h: 60, 
        invul: 0, 
        shield: false, 
        triple: 0 
      };
    }
    bulletsRef.current = [];
    enemiesRef.current = [];
    particlesRef.current = [];
    powerUpsRef.current = [];
  };

  const nextLevel = () => {
    setLevel(l => l + 1);
    setHealth(3); // Restore health
    setTimeLeft(45); // Reset timer
    setGameState('PLAYING');
    enemiesRef.current = [];
    bulletsRef.current = [];
    powerUpsRef.current = [];
  };

  // --- Vast Star Background ---

  const initStars = (width: number, height: number) => {
    starsRef.current = Array.from({ length: 200 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      s: Math.random() * 1.5 + 0.5,
      alpha: Math.random()
    }));

    nebulaeRef.current = Array.from({ length: 5 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: randomRange(200, 500),
      color: COLORS.NEBULA[Math.floor(Math.random() * COLORS.NEBULA.length)]
    }));
  };

  // --- Game Loop Logic ---

  const spawnEnemy = (width: number) => {
    const now = Date.now();
    const diffMod = difficulty === 'EASY' ? 0.7 : difficulty === 'HARD' ? 1.5 : 1;
    
    // Weighted selection for enemy types
    let type: Enemy['type'] = 'basic';
    const roll = Math.random();
    
    if (level === 1) {
      // Level 1: 70% basic, 30% fast
      type = roll < 0.7 ? 'basic' : 'fast';
    } else if (level === 2) {
      // Level 2: 40% basic, 40% fast, 20% heavy
      if (roll < 0.4) type = 'basic';
      else if (roll < 0.8) type = 'fast';
      else type = 'heavy';
    } else {
      // Level 3+: 30% basic, 40% fast, 30% heavy
      if (roll < 0.3) type = 'basic';
      else if (roll < 0.7) type = 'fast';
      else type = 'heavy';
    }
    
    let enemy: Enemy;
    switch(type) {
      case 'fast':
        enemy = { x: randomRange(40, width - 40), y: -50, width: 60, height: 60, hp: 1, maxHp: 1, speed: (4 + level * 0.5) * diffMod, type, color: COLORS.FAST, scoreValue: 150, lastShot: now };
        break;
      case 'heavy':
        enemy = { x: randomRange(50, width - 50), y: -50, width: 80, height: 80, hp: Math.ceil(3 * diffMod), maxHp: Math.ceil(3 * diffMod), speed: (1.5 + level * 0.1) * diffMod, type, color: COLORS.HEAVY, scoreValue: 500, lastShot: now };
        break;
      default:
        enemy = { x: randomRange(40, width - 40), y: -50, width: 60, height: 60, hp: 1, maxHp: 1, speed: (2 + level * 0.2) * diffMod, type: 'basic', color: COLORS.BASIC, scoreValue: 100, lastShot: now };
    }
    enemiesRef.current.push(enemy);
  };

  const createExplosion = (x: number, y: number, color: string, count = 30, isHeavy = false) => {
    shakeRef.current = isHeavy ? 15 : 8;
    sounds.playExplosion(isHeavy);
    
    particlesRef.current.push({
      x, y, vx: 0, vy: 0, life: 1.0, color: '#ffffff', size: isHeavy ? 40 : 20, glow: true
    });

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * (isHeavy ? 12 : 8) + 2;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color,
        size: Math.random() * (isHeavy ? 6 : 4) + 2,
        glow: true
      });
    }
  };

  const update = (canvas: HTMLCanvasElement, delta: number) => {
    if (gameState !== 'PLAYING') return;

    const player = playerRef.current;
    const speed = 6;

    if (keysRef.current['ArrowLeft'] || keysRef.current['a']) player.x -= speed;
    if (keysRef.current['ArrowRight'] || keysRef.current['d']) player.x += speed;
    if (keysRef.current['ArrowUp'] || keysRef.current['w']) player.y -= speed;
    if (keysRef.current['ArrowDown'] || keysRef.current['s']) player.y += speed;

    player.x = Math.max(player.w/2, Math.min(canvas.width - player.w/2, player.x));
    player.y = Math.max(player.h/2, Math.min(canvas.height - player.h/2, player.y));

    const now = Date.now();
    if (keysRef.current[' '] && now - lastShotRef.current > 150) {
      sounds.playShoot();
      const bSpeed = 10;
      const spawnY = player.y - player.h / 2 - 10;
      if (player.triple > 0) {
        bulletsRef.current.push({ x: player.x, y: spawnY, vx: 0, vy: -bSpeed, power: 1, color: COLORS.BULLET });
        bulletsRef.current.push({ x: player.x, y: spawnY, vx: -2, vy: -bSpeed, power: 1, color: COLORS.BULLET });
        bulletsRef.current.push({ x: player.x, y: spawnY, vx: 2, vy: -bSpeed, power: 1, color: COLORS.BULLET });
        player.triple -= 1;
      } else {
        bulletsRef.current.push({ x: player.x, y: spawnY, vx: 0, vy: -bSpeed, power: 1, color: COLORS.BULLET });
      }
      lastShotRef.current = now;
    }

    bulletsRef.current = bulletsRef.current.filter(b => {
      b.x += b.vx;
      b.y += b.vy;

      // Enemy bullet collision with player
      if (b.isEnemy && player.invul <= 0) {
        if (Math.abs(b.x - player.x) < player.w / 2 && Math.abs(b.y - player.y) < player.h / 2) {
          if (player.shield) {
            player.shield = false;
            unlockAchievement('shield_master');
            sounds.playPowerUp();
          } else {
            setHealth(h => {
              const newH = h - 1;
              if (newH <= 0) setGameState('GAMEOVER');
              return newH;
            });
          }
          player.invul = 120;
          return false;
        }
      }

      return b.y > -50 && b.y < canvas.height + 50 && b.x > -50 && b.x < canvas.width + 50;
    });

    const spawnRate = (0.01 + level * 0.002) * (difficulty === 'EASY' ? 0.5 : difficulty === 'HARD' ? 2 : 1);
    if (Math.random() < spawnRate) {
      spawnEnemy(canvas.width);
    }

    enemiesRef.current = enemiesRef.current.filter(e => {
      e.y += e.speed;
      
      // Enemy firing logic
      const now = Date.now();
      const fireInterval = difficulty === 'HARD' ? 1500 : 2500;
      if (now - e.lastShot > fireInterval && e.y > 0 && e.y < canvas.height * 0.6) {
        bulletsRef.current.push({
          x: e.x,
          y: e.y + e.height / 2,
          vx: 0,
          vy: 5,
          power: 1,
          color: '#ff4400', // Bright orange for enemy missiles
          isEnemy: true
        });
        e.lastShot = now;
      }

      bulletsRef.current.forEach((b, bi) => {
        if (!b.isEnemy && b.x > e.x - e.width/2 && b.x < e.x + e.width/2 && b.y > e.y - e.height/2 && b.y < e.y + e.height/2) {
          e.hp -= b.power;
          bulletsRef.current.splice(bi, 1);
          createExplosion(b.x, b.y, e.color, 5);
        }
      });

      if (player.invul <= 0 && 
          Math.abs(player.x - e.x) < (player.w + e.width) / 2.5 && 
          Math.abs(player.y - e.y) < (player.h + e.height) / 2.5) {
        
        if (player.shield) {
          player.shield = false;
          unlockAchievement('shield_master');
          sounds.playPowerUp();
        } else {
          setHealth(h => {
            const newH = h - 1;
            if (newH <= 0) setGameState('GAMEOVER');
            return newH;
          });
        }
        
        player.invul = 120;
        e.hp = 0;
      }

      if (e.y > canvas.height + 50) {
        setScore(s => Math.max(0, s - 50));
        setShowWarning(true);
        setTimeout(() => setShowWarning(false), 1000);
        return false;
      }

      if (e.hp <= 0) {
        setScore(s => {
          const newScore = s + e.scoreValue;
          if (newScore >= 5000) unlockAchievement('ace_pilot');
          return newScore;
        });
        unlockAchievement('first_blood');
        createExplosion(e.x, e.y, e.color, e.type === 'heavy' ? 50 : 25, e.type === 'heavy');
        
        if (Math.random() < 0.1) {
          powerUpsRef.current.push({
            x: e.x, y: e.y,
            type: Math.random() > 0.5 ? 'triple' : 'shield',
            color: Math.random() > 0.5 ? COLORS.TRIPLE : COLORS.SHIELD,
            size: 20
          });
        }
        return false;
      }
      return true;
    });

    powerUpsRef.current = powerUpsRef.current.filter(p => {
      p.y += 2;
      if (Math.abs(player.x - p.x) < 30 && Math.abs(player.y - p.y) < 30) {
        sounds.playPowerUp();
        if (p.type === 'triple') {
          player.triple = 50;
          unlockAchievement('power_hungry');
        } else {
          player.shield = true;
        }
        return false;
      }
      return p.y < canvas.height + 50;
    });

    particlesRef.current = particlesRef.current.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
      return p.life > 0;
    });

    starsRef.current.forEach(s => {
      s.y += s.s * 0.5;
      if (s.y > canvas.height) s.y = 0;
      s.alpha = 0.5 + Math.sin(Date.now() * 0.001 * s.s) * 0.5;
    });

    if (player.invul > 0) player.invul--;
    if (shakeRef.current > 0) shakeRef.current *= 0.9;

    // Timer logic
    setTimeLeft(prev => {
      const next = prev - 1/60; // Assuming 60fps
      if (next <= 0) {
        sounds.playLevelUp();
        setGameState('LEVEL_COMPLETE');
        if (level === 3) unlockAchievement('survivor');
        return 0;
      }
      return next;
    });
  };

  const draw = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    ctx.save();
    if (shakeRef.current > 0.5) {
      ctx.translate((Math.random() - 0.5) * shakeRef.current, (Math.random() - 0.5) * shakeRef.current);
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    nebulaeRef.current.forEach(n => {
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      grad.addColorStop(0, n.color + '33');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    });

    starsRef.current.forEach(s => {
      ctx.globalAlpha = s.alpha * (s.s / 1.5);
      ctx.fillStyle = COLORS.STAR;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    particlesRef.current.forEach(p => {
      ctx.globalAlpha = p.life;
      if (p.glow) {
        ctx.shadowBlur = p.size * 2;
        ctx.shadowColor = p.color;
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1.0;

    // Draw Powerups
    powerUpsRef.current.forEach(p => {
      const img = p.type === 'triple' ? imagesRef.current.POWERUP_TRIPLE : imagesRef.current.POWERUP_SHIELD;
      if (img) {
        ctx.drawImage(img, p.x - 15, p.y - 15, 30, 30);
      } else {
        ctx.shadowBlur = 15;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    });

    // Draw Enemies
    enemiesRef.current.forEach(e => {
      let img: HTMLImageElement | undefined;
      if (e.type === 'fast') img = imagesRef.current.ENEMY_FAST;
      else if (e.type === 'heavy') img = imagesRef.current.ENEMY_HEAVY;
      else img = imagesRef.current.ENEMY_BASIC;

      if (img) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(Math.PI); // Enemies usually face down
        ctx.drawImage(img, -e.width / 2, -e.height / 2, e.width, e.height);
        ctx.restore();
        
        if (e.type === 'heavy') {
          ctx.fillStyle = '#333';
          ctx.fillRect(e.x - 20, e.y - 45, 40, 5);
          ctx.fillStyle = '#ff00ff';
          ctx.fillRect(e.x - 20, e.y - 45, (e.hp / e.maxHp) * 40, 5);
        }
      } else {
        ctx.shadowBlur = 15;
        ctx.shadowColor = e.color;
        ctx.fillStyle = e.color;
        ctx.save();
        ctx.translate(e.x, e.y);
        if (e.type === 'fast') {
          ctx.beginPath();
          ctx.moveTo(0, 15);
          ctx.lineTo(-10, -15);
          ctx.lineTo(10, -15);
          ctx.closePath();
          ctx.fill();
        } else if (e.type === 'heavy') {
          ctx.fillRect(-e.width/2, -e.height/2, e.width, e.height);
          ctx.fillStyle = '#333';
          ctx.fillRect(-20, -45, 40, 5);
          ctx.fillStyle = '#ff00ff';
          ctx.fillRect(-20, -45, (e.hp / e.maxHp) * 40, 5);
        } else {
          ctx.beginPath();
          ctx.moveTo(0, 20);
          ctx.lineTo(-20, -10);
          ctx.lineTo(20, -10);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        ctx.shadowBlur = 0;
      }
    });

    ctx.fillStyle = COLORS.BULLET;
    bulletsRef.current.forEach(b => {
      if (b.isEnemy) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff4400';
        ctx.fillStyle = '#ff4400';
        // Draw a larger, glowing missile
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, 6, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        // Add a white core for better visibility
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, 2, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.shadowBlur = 10;
        ctx.shadowColor = b.color;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    });

    const player = playerRef.current;
    if (player.invul % 10 < 5) {
      ctx.save();
      ctx.translate(player.x, player.y);
      if (player.shield) {
        ctx.strokeStyle = COLORS.SHIELD;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 20;
        ctx.shadowColor = COLORS.SHIELD;
        ctx.beginPath();
        ctx.arc(0, 0, 35, 0, Math.PI * 2);
        ctx.stroke();
      }

      const playerImg = imagesRef.current.PLAYER;
      if (playerImg) {
        ctx.drawImage(playerImg, -player.w / 2, -player.h / 2, player.w, player.h);
      } else {
        ctx.shadowBlur = 25;
        ctx.shadowColor = COLORS.PLAYER;
        ctx.fillStyle = COLORS.PLAYER;
        ctx.beginPath();
        ctx.moveTo(0, -25);
        ctx.lineTo(-20, 15);
        ctx.lineTo(0, 5);
        ctx.lineTo(20, 15);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 10, 5 + Math.random() * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  };

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    update(canvas, 1);
    draw(ctx, canvas);
    requestRef.current = requestAnimationFrame(gameLoop);
  }, [gameState, score, level, health]);

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        initStars(canvas.width, canvas.height);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key] = true;
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        setGameState(prev => prev === 'PLAYING' ? 'PAUSED' : prev === 'PAUSED' ? 'PLAYING' : prev);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current[e.key] = false;
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameLoop]);

  const handleTouch = (e: React.TouchEvent) => {
    if (gameState !== 'PLAYING') return;
    const touch = e.touches[0];
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      playerRef.current.x = touch.clientX - rect.left;
      playerRef.current.y = touch.clientY - rect.top - 50;
      keysRef.current[' '] = true;
    }
  };

  const handleTouchEnd = () => {
    keysRef.current[' '] = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (gameState !== 'PLAYING') return;
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      playerRef.current.x = e.clientX - rect.left;
      playerRef.current.y = e.clientY - rect.top;
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (gameState !== 'PLAYING') return;
    if (e.button === 0) { // Left click
      keysRef.current[' '] = true;
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button === 0) {
      keysRef.current[' '] = false;
    }
  };

  return (
    <div className="min-h-screen bg-[#020205] text-white font-sans overflow-hidden selection:bg-cyan-500/30">
      <div className="fixed inset-0 pointer-events-none opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent" />
      </div>

      <div ref={containerRef} className="relative w-full h-screen flex flex-col md:flex-row">
        <aside className="hidden lg:flex w-80 border-r border-white/10 bg-black/60 backdrop-blur-2xl p-8 flex-col gap-8 z-20">
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
              TINA STAR PIONEER
            </h1>
            <p className="text-xs uppercase tracking-widest text-white/40 font-bold">浩瀚星空 · 极致战斗</p>
          </div>

          <div className="space-y-6">
            <section>
              <h3 className="text-xs font-bold uppercase text-cyan-400 mb-4 flex items-center gap-2">
                <Gamepad2 className="w-4 h-4" /> 操作指南
              </h3>
              <ul className="space-y-3 text-sm text-white/60">
                <li className="flex justify-between"><span>移动</span> <span className="text-white font-mono">WASD / 鼠标移动</span></li>
                <li className="flex justify-between"><span>射击</span> <span className="text-white font-mono">空格 / 鼠标左键</span></li>
                <li className="flex justify-between"><span>暂停</span> <span className="text-white font-mono">P 键</span></li>
                <li className="flex justify-between"><span>触屏</span> <span className="text-white font-mono">滑动移动+自动射击</span></li>
              </ul>
            </section>

            <section>
              <h3 className="text-xs font-bold uppercase text-purple-400 mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4" /> 道具说明
              </h3>
              <div className="space-y-4">
                <div className="flex gap-3 items-start">
                  <div className="p-2 rounded-lg bg-green-500/20 border border-green-500/30">
                    <Zap className="w-4 h-4 text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">三向子弹</p>
                    <p className="text-xs text-white/40">大幅增强火力范围</p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
                    <Shield className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">能量护盾</p>
                    <p className="text-xs text-white/40">抵挡一次致命伤害</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              <h3 className="text-xs font-bold uppercase text-yellow-400 mb-4 flex items-center gap-2">
                <Trophy className="w-4 h-4" /> 成就系统
              </h3>
              <div className="space-y-2">
                {achievements.map(a => (
                  <div key={a.id} className={`p-3 rounded-xl border transition-all ${a.unlocked ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-white/5 border-white/10 opacity-40'}`}>
                    <div className="flex items-center gap-3">
                      <div className={a.unlocked ? 'text-yellow-400' : 'text-white/40'}>{a.icon}</div>
                      <div>
                        <p className="text-xs font-bold">{a.title}</p>
                        <p className="text-[10px] text-white/40 leading-tight">{a.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </aside>

        <main className="flex-1 relative overflow-hidden flex flex-col">
          <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-10 pointer-events-none">
            <div className="flex gap-4">
              <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-3 rounded-2xl flex items-center gap-4 shadow-2xl">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Score</span>
                  <span className="text-2xl font-mono font-bold text-cyan-400">{score.toLocaleString()}</span>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Level</span>
                  <span className="text-2xl font-mono font-bold text-purple-400">{level}</span>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Time</span>
                  <span className={`text-2xl font-mono font-bold ${timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>
                    {Math.ceil(timeLeft)}s
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <motion.div 
                  key={i}
                  animate={{ scale: i < health ? 1 : 0.8, opacity: i < health ? 1 : 0.2 }}
                  className={`p-2 rounded-xl border shadow-lg ${i < health ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-white/5 border-white/10 text-white/20'}`}
                >
                  <Heart className="w-5 h-5 fill-current" />
                </motion.div>
              ))}
            </div>
          </div>

          <AnimatePresence>
            {showWarning && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute top-24 left-1/2 -translate-x-1/2 bg-red-600/90 text-white px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest z-20 shadow-2xl border border-red-400"
              >
                Enemy Escaped! -50
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {lastAchievement && (
              <motion.div 
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 100, opacity: 0 }}
                className="absolute top-6 right-6 bg-yellow-400 text-black p-4 rounded-2xl shadow-2xl flex items-center gap-4 z-50 border-4 border-yellow-200"
              >
                <div className="p-2 bg-black/10 rounded-xl">
                  {lastAchievement.icon}
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-60">成就解锁</p>
                  <p className="font-bold text-lg leading-tight">{lastAchievement.title}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <canvas 
            ref={canvasRef}
            onTouchMove={handleTouch}
            onTouchStart={handleTouch}
            onTouchEnd={handleTouchEnd}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            className="w-full h-full cursor-none"
          />

          <AnimatePresence>
            {gameState === 'START' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-40 p-6 overflow-y-auto"
              >
                <div className="max-w-2xl w-full text-center space-y-12 py-12">
                  <motion.div
                    initial={{ y: -50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ type: 'spring', damping: 12 }}
                  >
                    <h2 className="text-8xl font-black tracking-tighter mb-2 italic bg-clip-text text-transparent bg-gradient-to-b from-white via-cyan-400 to-blue-600">
                      TINA <span className="text-white">STAR</span>
                    </h2>
                    <p className="text-2xl font-bold text-cyan-400/50 uppercase tracking-[1em] ml-[1em]">Pioneer</p>
                  </motion.div>

                  <div className="space-y-6">
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-white/40">选择难度等级</p>
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { id: 'EASY', label: '简单', color: 'from-emerald-500 to-teal-600', desc: '敌机较少，速度慢' },
                        { id: 'NORMAL', label: '普通', color: 'from-cyan-500 to-blue-600', desc: '标准挑战' },
                        { id: 'HARD', label: '困难', color: 'from-rose-500 to-red-600', desc: '疯狂的弹幕与速度' }
                      ].map((d) => (
                        <button
                          key={d.id}
                          onClick={() => initGame(d.id as Difficulty)}
                          className={`group relative p-6 rounded-3xl bg-gradient-to-br ${d.color} transition-all transform hover:scale-105 active:scale-95 shadow-2xl overflow-hidden`}
                        >
                          <div className="relative z-10 space-y-1">
                            <p className="text-2xl font-black text-white">{d.label}</p>
                            <p className="text-[10px] text-white/60 font-bold uppercase">{d.id}</p>
                          </div>
                          <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-left">
                    <div className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm">
                      <p className="text-[10px] font-bold text-cyan-400 uppercase mb-3 tracking-widest">Desktop Controls</p>
                      <div className="space-y-2 text-xs text-white/60">
                        <p className="flex justify-between"><span>移动</span> <span className="text-white font-mono">WASD / 鼠标</span></p>
                        <p className="flex justify-between"><span>射击</span> <span className="text-white font-mono">空格 / 左键</span></p>
                        <p className="flex justify-between"><span>暂停</span> <span className="text-white font-mono">P / ESC</span></p>
                      </div>
                    </div>
                    <div className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm">
                      <p className="text-[10px] font-bold text-purple-400 uppercase mb-3 tracking-widest">Mobile Controls</p>
                      <div className="space-y-2 text-xs text-white/60">
                        <p>滑动屏幕控制移动</p>
                        <p>战机将自动进行射击</p>
                        <p>点击右上角可暂停游戏</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {gameState === 'LEVEL_COMPLETE' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-cyan-950/90 backdrop-blur-xl flex items-center justify-center z-40 p-6"
              >
                <div className="max-w-md w-full text-center space-y-8">
                  <div className="space-y-2">
                    <h2 className="text-7xl font-black italic text-cyan-400 tracking-tighter">LEVEL CLEAR</h2>
                    <p className="text-white/40 font-bold uppercase tracking-[0.3em]">关卡已完成</p>
                  </div>
                  <div className="bg-black/60 border border-cyan-500/30 p-10 rounded-[2.5rem] shadow-2xl">
                    <p className="text-sm text-white/60 mb-8">准备好进入下一阶段了吗？</p>
                    <div className="space-y-4">
                      <button 
                        onClick={nextLevel}
                        className="w-full py-5 bg-cyan-500 text-black font-black text-xl rounded-2xl hover:scale-105 transition-transform flex items-center justify-center gap-2"
                      >
                        <ChevronRight className="w-6 h-6" /> 进入下一关
                      </button>
                      <button 
                        onClick={() => setGameState('START')}
                        className="w-full py-5 bg-white/5 border border-white/10 text-white font-bold rounded-2xl hover:bg-white/10 transition-all"
                      >
                        返回主菜单
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {gameState === 'PAUSED' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/70 backdrop-blur-xl flex items-center justify-center z-40"
              >
                <div className="text-center space-y-8">
                  <h2 className="text-6xl font-black italic tracking-tighter">游戏暂停</h2>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setGameState('PLAYING')}
                      className="px-10 py-5 bg-white text-black font-black rounded-2xl hover:scale-105 transition-transform flex items-center gap-2 shadow-2xl"
                    >
                      <Play className="w-6 h-6 fill-current" /> 继续
                    </button>
                    <button 
                      onClick={() => setGameState('START')}
                      className="px-10 py-5 bg-white/5 border border-white/20 font-black rounded-2xl hover:bg-white/10 transition-all"
                    >
                      退出
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {gameState === 'GAMEOVER' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-red-950/95 backdrop-blur-2xl flex items-center justify-center z-40 p-6"
              >
                <div className="max-w-md w-full text-center space-y-8">
                  <div className="space-y-2">
                    <h2 className="text-7xl font-black italic text-red-500 tracking-tighter">MISSION FAILED</h2>
                    <p className="text-white/40 font-bold uppercase tracking-[0.3em]">战机已被摧毁</p>
                  </div>

                  <div className="bg-black/60 border border-white/10 p-10 rounded-[2.5rem] space-y-8 shadow-2xl">
                    <div className="flex justify-between items-center">
                      <span className="text-white/40 uppercase font-black text-xs tracking-widest">最终得分</span>
                      <span className="text-4xl font-mono font-black text-cyan-400">{score.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/40 uppercase font-black text-xs tracking-widest">最高关卡</span>
                      <span className="text-4xl font-mono font-black text-purple-400">{level}</span>
                    </div>
                    
                    <div className="pt-6 border-t border-white/10">
                      <p className="text-[10px] font-black text-white/40 uppercase mb-4 text-left tracking-widest">解锁成就</p>
                      <div className="flex flex-wrap gap-3">
                        {achievements.filter(a => a.unlocked).map(a => (
                          <div key={a.id} className="p-3 bg-yellow-500/20 border border-yellow-500/40 rounded-2xl text-yellow-400 shadow-lg" title={a.title}>
                            {a.icon}
                          </div>
                        ))}
                        {achievements.filter(a => a.unlocked).length === 0 && (
                          <p className="text-sm text-white/20 italic">暂无成就</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <button 
                      onClick={() => initGame()}
                      className="w-full py-6 bg-white text-black font-black text-2xl rounded-3xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 shadow-2xl"
                    >
                      <RotateCcw className="w-8 h-8" /> 再次尝试
                    </button>
                    <button 
                      onClick={() => setGameState('START')}
                      className="w-full py-5 bg-white/5 border border-white/10 text-white font-bold rounded-2xl hover:bg-white/10 transition-all"
                    >
                      返回主菜单
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}} />
    </div>
  );
}
