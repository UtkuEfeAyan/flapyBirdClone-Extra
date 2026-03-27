// ─── Constants ────────────────────────────────────────────────────────────────

const PIPE_WIDTH      = 60;   

const BIRD_X          = 120;   

const FLAP_VELOCITY   = -310;

const GRAVITY         = 900;

const BASE_PIPE_SPEED = 180;

const BASE_PIPE_INTERVAL = 1700;

const MIN_PIPE_SPEED  = 340;

const MIN_PIPE_INTERVAL = 900;



function getDifficulty(score) {

  const t = Math.min(score / 30, 1);

  return {

    speed:    BASE_PIPE_SPEED + (MIN_PIPE_SPEED - BASE_PIPE_SPEED) * t,

    interval: BASE_PIPE_INTERVAL - (BASE_PIPE_INTERVAL - MIN_PIPE_INTERVAL) * t,

    gapMin:   Math.max(130, 175 - score * 1.2),

    gapMax:   Math.max(155, 210 - score * 1.0),

    moving:   score >= 8,

    rockets:  score >= 5,

  };

}



// ─── Web Audio ────────────────────────────────────────────────────────────────

let audioCtx = null;



function getAudio() {

  if (!audioCtx || audioCtx.state === 'closed') {

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  }

  return audioCtx;

}



function playTone(freq, type, duration, volume) {

  try {

    const ctx  = getAudio();

    const osc  = ctx.createOscillator();

    const gain = ctx.createGain();

    osc.connect(gain);

    gain.connect(ctx.destination);

    osc.type = type;

    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(volume, ctx.currentTime);

    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.start();

    osc.stop(ctx.currentTime + duration);

  } catch (e) {}

}



function soundFlap()  { playTone(520, 'sine',     0.09, 0.15); }

function soundScore() { playTone(880, 'sine',     0.14, 0.18); playTone(1100, 'sine', 0.10, 0.12); }

function soundHit()   { playTone(160, 'sawtooth', 0.35, 0.22); playTone(90, 'square', 0.4, 0.18); }



// ─── Phaser Scene ─────────────────────────────────────────────────────────────

class GameScene extends Phaser.Scene {

  constructor() {

    super({ key: 'GameScene' });

  }



  create() {

    this.score       = 0;

    this.isGameOver  = false;

    this.hasStarted  = false;

    this.pipes       = [];

    this.rockets     = [];

    this.pipeTimer   = null;

    this.rocketTimer = null;

    this.lastInterval = BASE_PIPE_INTERVAL;

    this.wavePhase   = Math.random() * Math.PI * 2;

    this.pipeCount   = 0;

    this.wingPhase   = 0;



    const W = this.scale.width;

    const H = this.scale.height;

    this.groundH = 70;

    this.groundY = H - this.groundH;



    // Sky gradient

    const skyGfx = this.add.graphics();

    skyGfx.fillGradientStyle(0x87ceeb, 0x87ceeb, 0x4fa3e0, 0x4fa3e0, 1);

    skyGfx.fillRect(0, 0, W, H);



    // Clouds

    this.cloudData = [];

    for (let i = 0; i < 5; i++) {

      const g  = this.add.graphics();

      const cx = Phaser.Math.Between(50, W - 50);

      const cy = Phaser.Math.Between(40, H * 0.35);

      this.drawCloudAt(g, cx, cy);

      this.cloudData.push({ g, speed: Phaser.Math.FloatBetween(18, 35), cx, cy });

    }



    // Ground

    const groundGfx = this.add.graphics();

    groundGfx.fillStyle(0x8B5E3C);

    groundGfx.fillRect(0, this.groundY, W, this.groundH);

    groundGfx.fillStyle(0x5a8a3c);

    groundGfx.fillRect(0, this.groundY, W, 14);



    this.groundStripes = this.add.graphics();

    this.groundOffset  = 0;



    // Bird

    this.birdGfx      = this.add.graphics();

    this.birdX        = BIRD_X;

    this.birdY        = H / 2;

    this.birdVelocity = 0;

    this.birdAngle    = 0;

    this.drawBird();



    this.pipeGroup = this.add.group();



    // Score text

    this.scoreTxt = this.add.text(W / 2, 48, '0', {

      fontFamily: 'Arial Black, Arial',

      fontSize:   '52px',

      color:      '#ffffff',

      stroke:     '#000000',

      strokeThickness: 6,

    }).setOrigin(0.5).setDepth(10);



    // Level badge

    this.diffTxt = this.add.text(W - 12, 12, '', {

      fontFamily: 'Arial, sans-serif',

      fontSize:   '15px',

      color:      '#FFE400',

      stroke:     '#000',

      strokeThickness: 3,

    }).setOrigin(1, 0).setDepth(10);



    this.startOverlay    = this.buildOverlay(W, H, 'start');

    this.gameOverOverlay = this.buildOverlay(W, H, 'gameover');

    this.gameOverOverlay.setVisible(false);



    this.bestScore = parseInt(localStorage.getItem('flappy_best') || '0');



    this.input.on('pointerdown', () => this.handleFlap());

    this.input.keyboard.on('keydown-SPACE', () => this.handleFlap());

  }



  buildOverlay(W, H, type) {

    const c  = this.add.container(W / 2, H / 2).setDepth(20);

    const bg = this.add.graphics();

    bg.fillStyle(0x000000, 0.52);

    bg.fillRoundedRect(-190, -115, 380, 230, 26);



    if (type === 'start') {

      const t1 = this.add.text(0, -52, 'FLAPPY BIRD', {

        fontFamily: 'Arial Black, Arial', fontSize: '34px',

        color: '#FFE400', stroke: '#000', strokeThickness: 6,

      }).setOrigin(0.5);

      const t2 = this.add.text(0, 18, 'Tap / Space to Start', {

        fontFamily: 'Arial, sans-serif', fontSize: '20px',

        color: '#fff', stroke: '#000', strokeThickness: 3,

      }).setOrigin(0.5);

      c.add([bg, t1, t2]);

    } else {

      this.goTitle = this.add.text(0, -70, 'GAME OVER', {

        fontFamily: 'Arial Black, Arial', fontSize: '32px',

        color: '#FF4444', stroke: '#000', strokeThickness: 6,

      }).setOrigin(0.5);

      this.goScore = this.add.text(0, -22, 'Score: 0', {

        fontFamily: 'Arial, sans-serif', fontSize: '22px',

        color: '#fff', stroke: '#000', strokeThickness: 3,

      }).setOrigin(0.5);

      this.goBest = this.add.text(0, 16, 'Best: 0', {

        fontFamily: 'Arial, sans-serif', fontSize: '19px',

        color: '#FFE400', stroke: '#000', strokeThickness: 3,

      }).setOrigin(0.5);

      const restart = this.add.text(0, 66, '▶  Tap to Restart', {

        fontFamily: 'Arial, sans-serif', fontSize: '19px',

        color: '#fff', stroke: '#000', strokeThickness: 3,

      }).setOrigin(0.5);

      c.add([bg, this.goTitle, this.goScore, this.goBest, restart]);

    }

    return c;

  }



  drawCloudAt(g, cx, cy) {

    g.clear();

    g.fillStyle(0xffffff, 0.8);

    g.fillEllipse(cx,      cy,      88,  38);

    g.fillEllipse(cx - 30, cy + 9,  55,  30);

    g.fillEllipse(cx + 30, cy + 9,  55,  30);

  }



  drawBird() {

    const g  = this.birdGfx;

    g.clear();

    const bx = this.birdX;

    const by = this.birdY;



    // Wing animation

    this.wingPhase += (this.hasStarted && !this.isGameOver ? 0.38 : 0.06);

    const wingOffset = Math.sin(this.wingPhase) * 14;

    const wingH      = 11 + Math.abs(Math.cos(this.wingPhase)) * 9;



    // Shadow wing

    g.fillStyle(0xcc6600, 0.5);

    g.fillEllipse(bx - 2, by + 11, 25, 9);



    // Animated wing

    g.fillStyle(0xFFA500);

    g.fillEllipse(bx - 5, by + wingOffset, 30, wingH);



    // Body — 25% bigger (was 30×24 → 38×30)

    g.fillStyle(0xFFD700);

    g.fillEllipse(bx, by, 38, 30);



    // Eye

    g.fillStyle(0xffffff);

    g.fillCircle(bx + 10, by - 5, 7);

    g.fillStyle(0x222222);

    g.fillCircle(bx + 12, by - 5, 4);

    g.fillStyle(0xffffff);

    g.fillCircle(bx + 13, by - 7, 2);



    // Beak

    g.fillStyle(0xFF6600);

    g.fillTriangle(bx + 17, by - 1, bx + 30, by + 2, bx + 17, by + 6);



    if (this.isGameOver) {

      g.fillStyle(0xff0000, 0.3);

      g.fillEllipse(bx, by, 38, 30);

    }

  }



  spawnPipe() {

    const W    = this.scale.width;

    const diff = getDifficulty(this.score);

    const gap  = Phaser.Math.Between(diff.gapMin, diff.gapMax);

    this.pipeCount++;



    const minCenter = 100 + gap / 2;

    const maxCenter = this.groundY - gap / 2 - 65;



    let gapCenter;

    const pattern = this.pipeCount % Phaser.Math.Between(4, 7);

    if (pattern === 0) {

      this.wavePhase += Phaser.Math.FloatBetween(0.6, 1.2);

      const mid = (minCenter + maxCenter) / 2;

      const amp = (maxCenter - minCenter) / 2 * 0.85;

      gapCenter = Math.round(mid + Math.sin(this.wavePhase) * amp);

    } else if (pattern === 1) {

      const last = this._lastGapCenter || (minCenter + maxCenter) / 2;

      gapCenter = last < (minCenter + maxCenter) / 2

        ? Phaser.Math.Between(maxCenter - 55, maxCenter)

        : Phaser.Math.Between(minCenter, minCenter + 55);

    } else {

      gapCenter = Phaser.Math.Between(minCenter, maxCenter);

    }

    gapCenter = Phaser.Math.Clamp(gapCenter, minCenter, maxCenter);

    this._lastGapCenter = gapCenter;



    const topH = gapCenter - gap / 2;

    const botY = gapCenter + gap / 2;

    const botH = this.groundY - botY;



    const pipeGfx = this.add.graphics();

    this.renderPipe(pipeGfx, topH, botY, botH);

    pipeGfx.x = W;



    let moveDir = 0, moveSpeed = 0, moveDelta = 0, moveRange = 0;

    if (diff.moving && Phaser.Math.Between(0, 2) !== 0) {

      moveDir   = Phaser.Math.Between(0, 1) === 0 ? 1 : -1;

      moveSpeed = Phaser.Math.FloatBetween(35, 85);

      moveRange = Phaser.Math.Between(25, Math.min(60, (maxCenter - minCenter) * 0.35));

    }



    this.pipeGroup.add(pipeGfx);

    this.pipes.push({ gfx: pipeGfx, topH, botY, botH, gap, passed: false, moveDir, moveSpeed, moveDelta, moveRange });

  }



  renderPipe(g, topH, botY, botH) {

    const EXTEND = 700;

    // Top pipe body

    g.fillStyle(0x4CAF50);

    g.fillRect(0, -EXTEND, PIPE_WIDTH, topH - 12 + EXTEND);

    // Top cap

    g.fillStyle(0x388E3C);

    g.fillRect(-7, topH - 28, PIPE_WIDTH + 14, 28);

    // Bottom cap

    g.fillStyle(0x388E3C);

    g.fillRect(-7, botY, PIPE_WIDTH + 14, 28);

    // Bottom pipe body

    g.fillStyle(0x4CAF50);

    g.fillRect(0, botY + 28, PIPE_WIDTH, EXTEND + 200);

    // Highlights

    g.fillStyle(0x66BB6A, 0.45);

    g.fillRect(5, -EXTEND, 11, topH - 12 + EXTEND);

    g.fillRect(5, botY + 28, 11, EXTEND + 200);

  }



  drawRocket(g) {

    g.clear();

    const flicker = Math.random();

    // Rocket dimensions ~25% bigger: body was 52×18 → 65×22

    const RW = 65, RH = 22;



    // Flame

    const flameLen = 22 + flicker * 18;

    g.fillStyle(0xFF4400, 0.9);

    g.fillTriangle(RW / 2, -6, RW / 2, 6, RW / 2 + flameLen, 0);

    g.fillStyle(0xFFAA00, 0.7);

    g.fillTriangle(RW / 2, -4, RW / 2, 4, RW / 2 + flameLen * 0.6, 0);



    // Body

    g.fillStyle(0xCCCCCC);

    g.fillRect(-RW / 2, -RH / 2, RW, RH);



    // Nose cone

    g.fillStyle(0xFF2222);

    g.fillTriangle(-RW / 2, -RH / 2, -RW / 2, RH / 2, -RW / 2 - 22, 0);



    // Window

    g.fillStyle(0x88DDFF);

    g.fillCircle(-5, 0, 6);

    g.fillStyle(0x2299CC);

    g.fillCircle(-5, 0, 4);



    // Fins

    g.fillStyle(0xFF4444);

    g.fillTriangle(RW / 2 - 5, -RH / 2, RW / 2 + 8, -RH / 2 - 13, RW / 2 + 8, -RH / 2);

    g.fillTriangle(RW / 2 - 5,  RH / 2, RW / 2 + 8,  RH / 2 + 13, RW / 2 + 8,  RH / 2);



    // Warning stripes

    g.fillStyle(0xFF0000, 0.6);

    g.fillRect(-RW / 2 + 18, -RH / 2, 7, RH);

    g.fillRect(-RW / 2 + 33, -RH / 2, 7, RH);

  }



  spawnRocket() {

    const W     = this.scale.width;

    const y     = Phaser.Math.Between(70, this.groundY - 50);

    const speed = Phaser.Math.Between(320, 520);

    const gfx   = this.add.graphics().setDepth(5);

    gfx.x = W + 80;

    gfx.y = y;

    this.drawRocket(gfx);

    this.rockets.push({ gfx, y, speed, w: 88, h: 22 });

  }



  scheduleRockets() {

    if (this.rocketTimer) this.rocketTimer.remove();

    this.rocketTimer = this.time.addEvent({

      delay: Phaser.Math.Between(2200, 4000),

      callback: () => {

        if (!this.isGameOver && getDifficulty(this.score).rockets) this.spawnRocket();

        this.scheduleRockets();

      },

      callbackScope: this,

    });

  }



  handleFlap() {

    if (this.isGameOver) {

      this.scene.restart();

      return;

    }

    if (!this.hasStarted) {

      this.hasStarted = true;

      this.startOverlay.setVisible(false);

      this.schedulePipes();

      this.spawnPipe();

      this.scheduleRockets();

    }

    this.birdVelocity = FLAP_VELOCITY;

    soundFlap();

  }



  schedulePipes() {

    const diff = getDifficulty(this.score);

    this.lastInterval = diff.interval;

    if (this.pipeTimer) this.pipeTimer.remove();

    this.pipeTimer = this.time.addEvent({

      delay: diff.interval,

      callback: () => {

        this.spawnPipe();

        const newDiff = getDifficulty(this.score);

        if (Math.abs(newDiff.interval - this.lastInterval) > 30) this.schedulePipes();

      },

      callbackScope: this,

      loop: true,

    });

  }



  triggerGameOver() {

    if (this.isGameOver) return;

    this.isGameOver = true;

    soundHit();

    if (this.pipeTimer)   this.pipeTimer.remove();

    if (this.rocketTimer) this.rocketTimer.remove();

    if (this.score > this.bestScore) {

      this.bestScore = this.score;

      localStorage.setItem('flappy_best', this.bestScore);

    }

    this.goScore.setText(`Score: ${this.score}`);

    this.goBest.setText(`Best: ${this.bestScore}`);

    this.gameOverOverlay.setVisible(true);

    this.cameras.main.shake(180, 0.010);

  }



  checkCollisions() {

    const birdR = 13;  // slightly bigger hitbox to match bigger bird

    const bx    = this.birdX;

    const by    = this.birdY;



    if (by + birdR >= this.groundY || by - birdR <= 0) {

      this.triggerGameOver();

      return;

    }



    for (const pipe of this.pipes) {

      const px      = pipe.gfx.x;

      const left    = px - 7;

      const right   = px + PIPE_WIDTH + 7;

      const offsetY = pipe.gfx.y;



      if (bx + birdR > left && bx - birdR < right) {

        if (by - birdR < pipe.topH - 12 + offsetY) { this.triggerGameOver(); return; }

        if (by + birdR > pipe.botY + offsetY)       { this.triggerGameOver(); return; }

      }



      if (!pipe.passed && px + PIPE_WIDTH < bx) {

        pipe.passed = true;

        this.score++;

        this.scoreTxt.setText(this.score);

        soundScore();

        this.tweens.add({ targets: this.scoreTxt, scaleX: 1.25, scaleY: 1.25, duration: 70, yoyo: true });

        const lvl = Math.floor(this.score / 5) + 1;

        this.diffTxt.setText(`LVL ${lvl}`);

      }

    }



    for (const r of this.rockets) {

      if (Math.abs(bx - r.gfx.x) < r.w / 2 + birdR && Math.abs(by - r.gfx.y) < r.h / 2 + birdR) {

        this.triggerGameOver();

        return;

      }

    }

  }



  update(time, delta) {

    const dt   = delta / 1000;

    const W    = this.scale.width;

    const diff = getDifficulty(this.score);



    // Clouds

    for (const c of this.cloudData) {

      c.cx -= c.speed * dt;

      if (c.cx < -100) { c.cx = W + 80; c.cy = Phaser.Math.Between(30, this.groundY * 0.4); }

      this.drawCloudAt(c.g, c.cx, c.cy);

    }



    // Ground stripes

    this.groundOffset = (this.groundOffset + diff.speed * dt) % 40;

    this.groundStripes.clear();

    this.groundStripes.fillStyle(0x7a5230, 0.35);

    for (let x = -40 + this.groundOffset; x < W + 40; x += 40) {

      this.groundStripes.fillRect(x, this.groundY + 14, 20, this.groundH - 14);

    }



    if (!this.hasStarted || this.isGameOver) {

      if (!this.isGameOver) this.birdY = this.scale.height / 2 + Math.sin(time * 0.003) * 10;

      this.drawBird();

      return;

    }



    // Bird physics

    this.birdVelocity += GRAVITY * dt;

    this.birdY        += this.birdVelocity * dt;

    this.birdAngle     = Phaser.Math.Clamp(this.birdVelocity * 0.1, -30, 90);



    // Move pipes

    for (let i = this.pipes.length - 1; i >= 0; i--) {

      const pipe = this.pipes[i];

      pipe.gfx.x -= diff.speed * dt;



      if (pipe.moveSpeed > 0) {

        pipe.moveDelta += pipe.moveDir * pipe.moveSpeed * dt;

        if (Math.abs(pipe.moveDelta) >= pipe.moveRange) pipe.moveDir *= -1;

        pipe.gfx.y = pipe.moveDelta;

      }



      if (pipe.gfx.x < -PIPE_WIDTH - 30) {

        pipe.gfx.destroy();

        this.pipes.splice(i, 1);

      }

    }



    // Move rockets

    for (let i = this.rockets.length - 1; i >= 0; i--) {

      const r = this.rockets[i];

      r.gfx.x -= r.speed * dt;

      this.drawRocket(r.gfx);

      if (r.gfx.x < -150) {

        r.gfx.destroy();

        this.rockets.splice(i, 1);

      }

    }



    this.checkCollisions();

    this.drawBird();

  }

}



// ─── Launch ───────────────────────────────────────────────────────────────────

const config = {

  type: Phaser.AUTO,

  width:  window.innerWidth,

  height: window.innerHeight,

  backgroundColor: '#87ceeb',

  parent: 'game-container',

  scene: GameScene,

  scale: {

    mode:       Phaser.Scale.RESIZE,

    autoCenter: Phaser.Scale.CENTER_BOTH,

  },

  render: { antialias: true, pixelArt: false },

};



new Phaser.Game(config);