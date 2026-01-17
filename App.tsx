import React, { useEffect, useRef, useState, useCallback } from 'react';
import HUD from './components/HUD';
import GameOver from './components/GameOver';
import { GameStatus, Player, Platform, GameState } from './types';

// Constants for initial calculation, but we use dynamic dimensions for rendering
const LOGICAL_WIDTH = 600;
const CANVAS_HEIGHT = 800; // Initial fallback
const PLATFORM_HEIGHT = 20;

// --- PHYSICS CONSTANTS ---
const GRAVITY = 0.6;           
const BASE_JUMP_FORCE = -15.0;  
const MOMENTUM_SCALE = 0.3;    

const AIR_ACCEL = 0.8;          
const GROUND_FRIC = 0.82;       
const AIR_FRIC = 0.985;         
const MAX_HORIZONTAL_SPEED = 15; 
const JUMP_BUFFER_MS = 200;     

const FLOOR_HEIGHT = 100;

// Combo Constants
const COMBO_MAX_TIME_MS = 3000;
const GROUND_TOLERANCE_MS = 250; 
const PLATFORM_GAP_AVG = 140;

// --- AUDIO ENGINE ---
class MusicEngine {
  ctx: AudioContext | null = null;
  isPlaying = false;
  nextNoteTime = 0;
  tempo = 125;
  lookahead = 25.0;
  scheduleAheadTime = 0.1;
  beatCount = 0;
  timerID: number | null = null;
  
  bassFreqs = [55, 55, 55, 55, 65.41, 65.41, 49, 49]; 
  
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  start() {
    if (this.isPlaying) return;
    this.init();
    this.isPlaying = true;
    this.beatCount = 0;
    if (this.ctx) this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.scheduler();
  }

  stop() {
    this.isPlaying = false;
    if (this.timerID) window.clearTimeout(this.timerID);
  }

  scheduler() {
    if (!this.isPlaying || !this.ctx) return;
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.beatCount, this.nextNoteTime);
      this.nextNote();
    }
    this.timerID = window.setTimeout(() => this.scheduler(), this.lookahead);
  }

  nextNote() {
    const secondsPerBeat = 60.0 / this.tempo;
    this.nextNoteTime += 0.25 * secondsPerBeat;
    this.beatCount++;
  }

  scheduleNote(beatNumber: number, time: number) {
    if (!this.ctx) return;

    const step = beatNumber % 16;
    const bar = Math.floor(beatNumber / 16) % 8;

    if (step % 4 === 0) {
      this.playKick(time);
    }

    if (step % 2 === 0 || (step === 15)) {
      this.playHiHat(time, step % 4 === 0 ? 0.05 : 0.03); 
    }

    if (step === 4 || step === 12) {
      this.playSnare(time);
    }

    if (step % 2 === 0) {
       const note = this.bassFreqs[bar % this.bassFreqs.length];
       if (step !== 0 || bar % 4 === 3) { 
         this.playBass(time, note);
       }
    }
    
    if (Math.random() > 0.8 && step % 2 !== 0) {
       this.playSynth(time, 440 + Math.random() * 220);
    }
  }

  playKick(time: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.5);
  }

  playSnare(time: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(100, time);
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  playHiHat(time: number, vol: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    
    osc.type = 'square';
    osc.frequency.value = 8000;
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    
    gain.gain.setValueAtTime(vol * 0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(time);
    osc.stop(time + 0.05);
  }

  playBass(time: number, freq: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, time);
    filter.frequency.linearRampToValueAtTime(100, time + 0.2);
    
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.linearRampToValueAtTime(0.01, time + 0.2);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(time);
    osc.stop(time + 0.2);
  }
  
  playSynth(time: number, freq: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.1, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(time);
    osc.stop(time + 0.3);
  }
}

const musicEngine = new MusicEngine();

interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  alpha: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [dimensions, setDimensions] = useState({ 
      width: window.innerWidth, 
      height: window.innerHeight,
      logicalHeight: 800,
      scale: 1
  });

  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    bestScore: 0,
    height: 0,
    maxHeight: 0,
    combo: 0,
    comboTimer: 0,
    maxSpeed: 0,
    status: GameStatus.MENU,
    speedMultiplier: 1.0,
    isMuted: false,
    actionText: undefined
  });

  const playerRef = useRef<Player>({
    x: LOGICAL_WIDTH / 2 - 16,
    y: 800 - 150,
    vx: 0,
    vy: 0,
    width: 32,
    height: 32,
    grounded: false,
    jumpHeld: false,
    speed: 0,
  });

  const platformsRef = useRef<Platform[]>([]);
  const starsRef = useRef<Star[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const keysRef = useRef<Record<string, boolean>>({});
  const cameraY = useRef<number>(0);
  const lastTime = useRef<number>(0);
  
  const jumpBufferTime = useRef<number>(0); 
  const lastPlatformY = useRef<number>(0); 
  const autoScrollSpeed = useRef<number>(0);
  const comboTimeRef = useRef<number>(0); 
  const groundTimeRef = useRef<number>(0); 
  const lastGroundDuration = useRef<number>(0); 

  const touchStartRef = useRef<{ id: number, x: number, y: number }[]>([]);

  // Responsive Scaling
  useEffect(() => {
    const handleResize = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        
        let scale = w / LOGICAL_WIDTH;
        if (w > h * 1.2) { 
            scale = h / 800; 
        }

        const logicalHeight = h / scale;
        
        setDimensions({
            width: w,
            height: h,
            logicalHeight: logicalHeight,
            scale: scale
        });
    };
    window.addEventListener('resize', handleResize);
    handleResize(); 
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- TOUCH CONTROLS ---
  const handleTouchStart = (e: React.TouchEvent) => {
    const w = window.innerWidth;
    for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        touchStartRef.current.push({ id: t.identifier, x: t.clientX, y: t.clientY });
    }
    updateTouchKeys(e.touches, w);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      const w = window.innerWidth;
      for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          const start = touchStartRef.current.find(s => s.id === t.identifier);
          if (start) {
              const dy = t.clientY - start.y;
              if (dy < -40) { // Swipe Up
                  jumpBufferTime.current = performance.now(); 
                  start.y = t.clientY; 
              }
          }
      }
      updateTouchKeys(e.touches, w);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      const w = window.innerWidth;
      for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          touchStartRef.current = touchStartRef.current.filter(s => s.id !== t.identifier);
      }
      updateTouchKeys(e.touches, w);
  };

  const updateTouchKeys = (touches: React.TouchList, w: number) => {
      let left = false;
      let right = false;
      const midX = w / 2;

      for (let i = 0; i < touches.length; i++) {
          const t = touches[i];
          if (t.clientX < midX) left = true;
          else right = true;
      }
      keysRef.current['ArrowLeft'] = left;
      keysRef.current['ArrowRight'] = right;
  };

  const initStars = useCallback((lHeight: number) => {
    const stars: Star[] = [];
    for (let i = 0; i < 200; i++) {
      const depth = Math.random(); 
      stars.push({
        x: Math.random() * LOGICAL_WIDTH,
        y: Math.random() * lHeight * 2, 
        size: Math.random() * 2.5 + 0.5,
        speed: depth * 0.8 + 0.2, 
        alpha: Math.random() * 0.7 + 0.3
      });
    }
    starsRef.current = stars;
  }, []);

  const spawnParticles = (x: number, y: number, color: string, count = 10) => {
      for(let i=0; i<count; i++) {
          particlesRef.current.push({
              x, y,
              vx: (Math.random() - 0.5) * 6,
              vy: (Math.random() - 0.5) * 6,
              life: 1.0,
              color: color,
              size: Math.random() * 3 + 1
          });
      }
  };

  const generatePlatform = (y: number): Platform => {
    const heightLevel = Math.abs(y); 
    const difficultyFactor = Math.min(heightLevel / 10000, 1.0); 
    
    const baseWidth = 120 - (60 * difficultyFactor); 
    const width = Math.max(40, baseWidth + Math.random() * 40);

    const moveChance = 0.15 + (difficultyFactor * 0.6);
    const isMoving = Math.random() < moveChance;

    return {
      x: Math.random() * (LOGICAL_WIDTH - width),
      y: y,
      width: width,
      height: PLATFORM_HEIGHT,
      type: isMoving ? 'moving' : 'normal',
      direction: Math.random() > 0.5 ? 1 : -1,
    };
  };

  const initPlatforms = useCallback((startFloorY: number) => {
    const platforms: Platform[] = [];
    for (let i = 1; i < 20; i++) {
      platforms.push(generatePlatform(startFloorY - i * 140));
    }
    platformsRef.current = platforms;
  }, []);

  const resetGame = () => {
    const worldFloorY = dimensions.logicalHeight - FLOOR_HEIGHT;
    
    playerRef.current = {
      x: LOGICAL_WIDTH / 2 - 16,
      y: worldFloorY - 32,
      vx: 0,
      vy: 0,
      width: 32,
      height: 32,
      grounded: true,
      jumpHeld: false,
      speed: 0,
    };
    cameraY.current = 0;
    autoScrollSpeed.current = 0;
    lastPlatformY.current = worldFloorY;
    jumpBufferTime.current = 0;
    comboTimeRef.current = 0;
    groundTimeRef.current = 0;
    lastGroundDuration.current = 0;
    keysRef.current = {}; 
    particlesRef.current = [];
    
    initPlatforms(worldFloorY);
    initStars(dimensions.logicalHeight);
    setGameState(prev => ({
      ...prev,
      score: 0,
      bestScore: prev.bestScore,
      height: 0,
      maxHeight: 0,
      combo: 0,
      comboTimer: 0,
      maxSpeed: 0,
      status: GameStatus.PLAYING,
      speedMultiplier: 1.0,
      actionText: undefined
    }));
  };

  const showActionText = (text: string, x: number, y: number) => {
    setGameState(prev => ({
      ...prev,
      actionText: { text, opacity: 1.0, x, y }
    }));
  };

  const toggleMute = () => {
    setGameState(prev => {
      const newMuted = !prev.isMuted;
      if (newMuted) {
        if (musicEngine.ctx) musicEngine.ctx.suspend();
      } else {
        musicEngine.resume();
      }
      return { ...prev, isMuted: newMuted };
    });
  };

  const update = (dt: number) => {
    if (gameState.status !== GameStatus.PLAYING) return;

    const worldFloorY = dimensions.logicalHeight - FLOOR_HEIGHT;
    const dtMs = dt * 16.67;
    const player = playerRef.current;
    const keys = keysRef.current;
    const now = performance.now();

    // 0. Particles
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.05;
        if(p.life <= 0) particlesRef.current.splice(i, 1);
    }

    // 1. Text Fade
    if (gameState.actionText) {
      setGameState(prev => {
        if (!prev.actionText) return prev;
        const newOp = prev.actionText.opacity - 0.02;
        if (newOp <= 0) return { ...prev, actionText: undefined };
        return { ...prev, actionText: { ...prev.actionText, opacity: newOp, y: prev.actionText.y - 0.5 } };
      });
    }

    // 2. Combo Logic
    if (gameState.combo > 0) {
      comboTimeRef.current -= dtMs;
      if (comboTimeRef.current <= 0) {
        setGameState(prev => ({ ...prev, combo: 0, comboTimer: 0 }));
        showActionText("COMBO END", player.x, player.y - 40);
      }
    }

    if (player.grounded) {
      groundTimeRef.current += dtMs;
      if (groundTimeRef.current > GROUND_TOLERANCE_MS && gameState.combo > 0) {
         setGameState(prev => ({ ...prev, combo: 0, comboTimer: 0 }));
         comboTimeRef.current = 0;
         showActionText("TOO SLOW!", player.x, player.y - 40);
      }
    } else {
      groundTimeRef.current = 0;
    }

    // 3. Auto-Scroll
    if (gameState.height > 5) {
      const targetSpeed = 0.8 + (gameState.height * 0.006); 
      autoScrollSpeed.current = autoScrollSpeed.current * 0.99 + targetSpeed * 0.01;
      cameraY.current -= autoScrollSpeed.current * dt;
    }

    // 4. Movement
    const moveDir = (keys['ArrowLeft'] || keys['a']) ? -1 : (keys['ArrowRight'] || keys['d']) ? 1 : 0;
    const comboSpeedBoost = Math.min(gameState.combo * 1.5, 12);
    const currentMaxSpeed = MAX_HORIZONTAL_SPEED + comboSpeedBoost;

    if (player.grounded) {
      player.vx += moveDir * AIR_ACCEL * 2.5; 
      player.vx *= GROUND_FRIC;
    } else {
      player.vx += moveDir * AIR_ACCEL;
      player.vx *= AIR_FRIC;
    }

    if (Math.abs(player.vx) > currentMaxSpeed) {
      player.vx = Math.sign(player.vx) * currentMaxSpeed;
    }
    
    if (!player.grounded) {
        player.vy += GRAVITY;
    }

    // 5. Jump
    const jumpPressed = keys[' '] || keys['ArrowUp'] || keys['w'];
    
    if (jumpPressed) {
        jumpBufferTime.current = now;
    }

    const canJump = player.grounded;
    const wantsToJump = (now - jumpBufferTime.current) < JUMP_BUFFER_MS;

    if (canJump && wantsToJump) {
        jumpBufferTime.current = 0; 
        lastGroundDuration.current = groundTimeRef.current;
        let force = BASE_JUMP_FORCE;
        force -= Math.abs(player.vx) * MOMENTUM_SCALE;
        force = Math.max(force, -25);
        player.vy = force;
        player.grounded = false;
        spawnParticles(player.x + 16, player.y + 32, '#fff', 5);
    }

    player.x += player.vx;
    player.y += player.vy;

    if (player.x < 0) {
      player.x = 0;
      player.vx *= -0.8; 
    }
    if (player.x + player.width > LOGICAL_WIDTH) {
      player.x = LOGICAL_WIDTH - player.width;
      player.vx *= -0.8; 
    }

    // 6. Collision
    let wasGrounded = player.grounded;
    let isNowGrounded = false;

    if (gameState.height < 50) {
        if (player.y + player.height >= worldFloorY) {
          player.y = worldFloorY - player.height;
          player.vy = 0;
          isNowGrounded = true;
          if (!wasGrounded) {
             spawnParticles(player.x + 16, player.y + 32, '#06b6d4', 8);
             if (lastPlatformY.current < worldFloorY - 50) {
                 setGameState(prev => ({ ...prev, combo: 0, comboTimer: 0 }));
                 comboTimeRef.current = 0;
             }
             lastPlatformY.current = worldFloorY;
          }
        }
    }

    if (player.vy >= 0) { 
      platformsRef.current.forEach(p => {
        if (p.type === 'moving' && p.direction) {
          const moveSpeed = 2.0 + (gameState.height * 0.003);
          p.x += p.direction * moveSpeed;
          if (p.x <= 0) {
            p.x = 0;
            p.direction = 1;
          } else if (p.x + p.width >= LOGICAL_WIDTH) {
            p.x = LOGICAL_WIDTH - p.width;
            p.direction = -1;
          }
        }

        const playerCenter = player.x + player.width / 2;
        const snapThreshold = Math.max(5, player.vy + 5); 

        if (playerCenter > p.x && playerCenter < p.x + p.width &&
            player.y + player.height >= p.y &&
            player.y + player.height <= p.y + p.height + snapThreshold) {
          
          player.y = p.y - player.height;
          player.vy = 0;
          isNowGrounded = true;
          
          if (!wasGrounded) {
              spawnParticles(player.x + 16, player.y + 32, '#ec4899', 8);
              const heightDiff = lastPlatformY.current - p.y; 
              
              if (heightDiff > 10) { 
                  const floors = Math.max(1, Math.round(heightDiff / PLATFORM_GAP_AVG));
                  const isFastJump = lastGroundDuration.current < GROUND_TOLERANCE_MS;
                  let newCombo = gameState.combo;
                  let scoreAdd = 0;
                  let actionMsg = undefined;

                  if (gameState.combo === 0) {
                      if (floors >= 2) {
                          newCombo = floors;
                          comboTimeRef.current = COMBO_MAX_TIME_MS;
                          actionMsg = "DOUBLE JUMP!";
                      } else if (isFastJump && floors >= 1) {
                          newCombo = 1;
                          comboTimeRef.current = COMBO_MAX_TIME_MS;
                          actionMsg = "COMBO START!";
                      }
                  } else {
                      newCombo += floors;
                      comboTimeRef.current = COMBO_MAX_TIME_MS;
                      if (floors >= 2) actionMsg = "SUPER JUMP!";
                      else actionMsg = `${newCombo}x COMBO!`;
                  }

                  const multiplier = newCombo > 0 ? Math.pow(newCombo, 1.1) : 1;
                  scoreAdd = Math.floor(heightDiff * multiplier);

                  setGameState(prev => ({
                      ...prev,
                      combo: newCombo,
                      score: prev.score + scoreAdd,
                      maxHeight: Math.max(prev.maxHeight, Math.floor((worldFloorY - p.y) / 10)),
                      actionText: actionMsg ? { text: actionMsg, opacity: 1, x: player.x, y: player.y - 40 } : prev.actionText
                  }));
              } else if (heightDiff < -10) {
                  setGameState(prev => ({ ...prev, combo: 0, comboTimer: 0 }));
                  comboTimeRef.current = 0;
              }
              lastPlatformY.current = p.y;
          }
        }
      });
    }

    player.grounded = isNowGrounded;

    // Camera Catch-up
    const targetCamY = player.y - dimensions.logicalHeight * 0.55;
    if (targetCamY < cameraY.current) {
        cameraY.current += (targetCamY - cameraY.current) * 0.15;
    }
    if (cameraY.current > 0) cameraY.current = 0; 
    if (player.y - dimensions.logicalHeight * 0.4 < cameraY.current) {
         cameraY.current = player.y - dimensions.logicalHeight * 0.4;
    }

    const bottomBound = cameraY.current + dimensions.logicalHeight;
    platformsRef.current = platformsRef.current.filter(p => p.y < bottomBound + 100);
    
    const highestPlatformY = platformsRef.current.length > 0 ? Math.min(...platformsRef.current.map(p => p.y)) : cameraY.current;
    if (highestPlatformY > cameraY.current - 200) {
      for(let i=1; i<=3; i++) {
        platformsRef.current.push(generatePlatform(highestPlatformY - i * 140));
      }
    }

    if (player.y > cameraY.current + dimensions.logicalHeight + 50) {
      setGameState(prev => ({ 
        ...prev, 
        status: GameStatus.GAMEOVER,
        bestScore: Math.max(prev.bestScore, prev.score)
      }));
    }

    const currentSpeed = Math.sqrt(player.vx ** 2 + player.vy ** 2);
    setGameState(prev => ({ 
        ...prev, 
        height: Math.max(prev.height, Math.floor((worldFloorY - player.y) / 10)),
        comboTimer: Math.max(0, comboTimeRef.current / COMBO_MAX_TIME_MS),
        maxSpeed: Math.max(prev.maxSpeed, currentSpeed)
    }));
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return; // Safer check
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    
    // Resize if dimensions changed
    if (canvas.width !== dimensions.width * dpr || canvas.height !== dimensions.height * dpr) {
        canvas.width = dimensions.width * dpr;
        canvas.height = dimensions.height * dpr;
    }

    // 1. Reset transform to clear screen in physical pixels
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; // Pillarbox color
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Setup Logical System
    ctx.scale(dpr * dimensions.scale, dpr * dimensions.scale);

    // 3. Calculate Centering
    // dimensions.width is physical CSS pixels. 
    // dimensions.scale converts Logical(600px base) to CSS pixels.
    // logicalCanvasWidth is the width of the screen in "Game Units"
    const logicalCanvasWidth = dimensions.width / dimensions.scale;
    const xOffset = (logicalCanvasWidth - LOGICAL_WIDTH) / 2;

    ctx.translate(xOffset, 0);

    // --- CLIPPING FIX ---
    // Clip drawing to the Logical Game Area so no trails/particles bleed into the pillarbox
    ctx.beginPath();
    ctx.rect(0, 0, LOGICAL_WIDTH, dimensions.logicalHeight);
    ctx.clip();

    const worldFloorY = dimensions.logicalHeight - FLOOR_HEIGHT;

    // Background restricted to Game Width
    const gradient = ctx.createLinearGradient(0, 0, 0, dimensions.logicalHeight);
    gradient.addColorStop(0, '#020617');
    gradient.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, dimensions.logicalHeight);

    // Draw borders for the game area
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, LOGICAL_WIDTH, dimensions.logicalHeight);

    starsRef.current.forEach(star => {
        let screenY = (star.y - (cameraY.current * star.speed)) % dimensions.logicalHeight;
        if (screenY < 0) screenY += dimensions.logicalHeight;

        const twinkle = Math.random() > 0.95 ? 0 : 1;
        ctx.globalAlpha = star.alpha * twinkle;
        ctx.fillStyle = '#e0f2fe';
        ctx.beginPath();
        ctx.arc(star.x, screenY, star.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    ctx.strokeStyle = 'rgba(6, 182, 212, 0.1)';
    ctx.lineWidth = 1;
    const gridOffsetY = -cameraY.current % 60;
    for (let y = gridOffsetY; y < dimensions.logicalHeight; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(LOGICAL_WIDTH, y); ctx.stroke();
    }

    ctx.save();
    ctx.translate(0, -cameraY.current);

    if (cameraY.current > -dimensions.logicalHeight) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, worldFloorY, LOGICAL_WIDTH, FLOOR_HEIGHT);
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#06b6d4';
        ctx.fillStyle = '#06b6d4';
        ctx.fillRect(0, worldFloorY, LOGICAL_WIDTH, 5);
        ctx.shadowBlur = 0;
    }
    
    platformsRef.current.forEach(p => {
      const isMoving = p.type === 'moving';
      ctx.shadowBlur = isMoving ? 15 : 10;
      ctx.shadowColor = isMoving ? '#ec4899' : '#06b6d4'; 
      
      const pGrad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.height);
      if (isMoving) {
        pGrad.addColorStop(0, '#f9a8d4');
        pGrad.addColorStop(1, '#db2777');
      } else {
        pGrad.addColorStop(0, '#67e8f9');
        pGrad.addColorStop(1, '#0891b2');
      }
      ctx.fillStyle = pGrad;
      ctx.beginPath(); ctx.roundRect(p.x, p.y, p.width, p.height, 4); ctx.fill();
      ctx.shadowBlur = 0;
    });

    particlesRef.current.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    const player = playerRef.current;
    
    const intensity = Math.min(gameState.combo, 12) / 12; 
    let r, g, b;
    if (intensity < 0.33) {
       const t = intensity * 3;
       r = 34 + (168 - 34) * t; g = 211 + (85 - 211) * t; b = 238 + (247 - 238) * t;
    } else if (intensity < 0.66) {
       const t = (intensity - 0.33) * 3;
       r = 168 + (236 - 168) * t; g = 85 + (72 - 85) * t; b = 247 + (153 - 247) * t;
    } else {
       const t = (intensity - 0.66) * 3;
       r = 236 + (255 - 236) * t; g = 72 + (255 - 72) * t; b = 153 + (255 - 153) * t;
    }
    const playerColor = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;

    const speed = Math.sqrt(player.vx ** 2 + player.vy ** 2);
    if (speed > 10 || gameState.combo > 2) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = playerColor;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.roundRect(player.x - player.vx * (i * 1.5), player.y - player.vy * (i * 1.5), player.width, player.height, 8);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.shadowBlur = 20 + (intensity * 10);
    ctx.shadowColor = playerColor;
    ctx.fillStyle = playerColor;
    ctx.beginPath();
    ctx.roundRect(player.x, player.y, player.width, player.height, 8);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'white';
    const lookX = player.vx > 1 ? 4 : (player.vx < -1 ? -4 : 0);
    const lookY = player.vy < -2 ? -4 : (player.vy > 2 ? 4 : 0);
    ctx.beginPath();
    ctx.ellipse(player.x + 10 + lookX, player.y + 10 + lookY, 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(player.x + 22 + lookX, player.y + 10 + lookY, 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'black';
    ctx.beginPath(); ctx.arc(player.x + 11 + lookX, player.y + 10 + lookY, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(player.x + 23 + lookX, player.y + 10 + lookY, 1.5, 0, Math.PI*2); ctx.fill();

    if (gameState.actionText) {
        ctx.save();
        ctx.globalAlpha = gameState.actionText.opacity;
        ctx.fillStyle = '#fff'; 
        ctx.font = '900 24px Orbitron';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(gameState.actionText.text, gameState.actionText.x + 16, gameState.actionText.y);
        ctx.fillText(gameState.actionText.text, gameState.actionText.x + 16, gameState.actionText.y);
        ctx.restore();
    }

    ctx.restore();

    const deathLine = cameraY.current + dimensions.logicalHeight + 50;
    const distToDeath = deathLine - player.y;
    
    if (distToDeath < 350 && gameState.status === GameStatus.PLAYING) {
      const warningAlpha = Math.max(0, (350 - distToDeath) / 350);
      const warningGrad = ctx.createLinearGradient(0, dimensions.logicalHeight, 0, dimensions.logicalHeight - 150);
      warningGrad.addColorStop(0, `rgba(220, 38, 38, ${warningAlpha * 0.8})`);
      warningGrad.addColorStop(1, 'rgba(220, 38, 38, 0)');
      ctx.fillStyle = warningGrad;
      ctx.fillRect(0, dimensions.logicalHeight - 150, LOGICAL_WIDTH, 150);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => keysRef.current[e.key] = true;
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current[e.key] = false;

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let frameId: number;
    const loop = (time: number) => {
      const dt = lastTime.current ? (time - lastTime.current) / 16.67 : 1;
      lastTime.current = time;
      update(dt);
      draw();
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    initPlatforms(dimensions.logicalHeight - FLOOR_HEIGHT);
    initStars(dimensions.logicalHeight);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(frameId);
    };
  }, [gameState.status, dimensions]);

  const handleStart = () => {
    if (!musicEngine.isPlaying) {
        musicEngine.start();
    }
    resetGame();
  };

  return (
    <div 
        ref={containerRef}
        className="relative w-full h-full bg-black overflow-hidden touch-none select-none"
        onContextMenu={(e) => e.preventDefault()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
    >
      <div className="absolute inset-0 scanlines z-20 pointer-events-none"></div>
      <div className="absolute inset-0 vignette z-20 pointer-events-none"></div>
      
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%' }}
        className="block"
      />

      {gameState.status === GameStatus.PLAYING && (
        <HUD 
          score={gameState.score} 
          height={gameState.height} 
          combo={gameState.combo}
          comboTimer={gameState.comboTimer}
          speed={Math.sqrt(playerRef.current.vx ** 2 + playerRef.current.vy ** 2)}
          isMuted={gameState.isMuted}
          onToggleMute={toggleMute}
        />
      )}

      {gameState.status === GameStatus.MENU && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-8 p-6 text-center z-30 pointer-events-auto">
          <div className="space-y-2 animate-pulse">
            <h1 className="text-6xl md:text-8xl font-orbitron font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 via-purple-500 to-pink-500 italic tracking-tighter drop-shadow-2xl filter brightness-110">
              NEON<br/>BUNNY
            </h1>
            <div className="h-1 w-32 bg-cyan-500 mx-auto rounded-full shadow-[0_0_10px_cyan]"></div>
            <p className="text-cyan-300 font-orbitron uppercase tracking-[0.4em] text-[10px] font-bold">Infinite Momentum Jumper</p>
          </div>

          <div className="max-w-xs space-y-4 text-zinc-300 text-sm bg-black/60 p-6 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl">
            <p className="leading-relaxed">
                <span className="text-cyan-400 font-bold border-b border-cyan-500/50">CONTROLS</span>
                <br/>
                <span className="text-white font-bold">PC:</span> Arrows/WASD + Space
                <br/>
                <span className="text-yellow-400 font-bold">Mobile:</span> Touch Sides to Run, Swipe Up to Jump.
            </p>
            <div className="grid grid-cols-2 gap-3 pt-2 text-[10px]">
               <div className="bg-white/5 p-2 rounded border border-white/5 hover:border-pink-500 transition-colors">
                  <span className="block text-pink-500 font-bold">SPEED</span>
                  <span className="text-zinc-500">Momentum = Height</span>
               </div>
               <div className="bg-white/5 p-2 rounded border border-white/5 hover:border-yellow-500 transition-colors">
                  <span className="block text-yellow-500 font-bold">COMBO</span>
                  <span className="text-zinc-500">Don't Stop Moving</span>
               </div>
            </div>
          </div>

          <button
            onClick={handleStart}
            className="group relative px-12 py-5 bg-white text-black font-orbitron font-black text-2xl rounded-xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.4)] overflow-hidden cursor-pointer"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <span className="relative z-10">RUN . EXE</span>
          </button>
          
          {gameState.bestScore > 0 && (
            <p className="text-zinc-500 font-orbitron text-xs uppercase tracking-widest animate-pulse">
              Personal Best: {Math.floor(gameState.bestScore)}
            </p>
          )}
        </div>
      )}

      {gameState.status === GameStatus.GAMEOVER && (
        <GameOver 
          score={gameState.score} 
          height={gameState.height} 
          maxSpeed={gameState.maxSpeed}
          combo={gameState.combo}
          onRestart={handleStart} 
        />
      )}
    </div>
  );
};