import Phaser from 'phaser';

const VIEW_WIDTH = 1280;
const VIEW_HEIGHT = 720;
const WORLD_WIDTH = 2880;
const START_X = 260;
const START_Y = 610;
const GATE_X = 2670;
const GATE_BASE_Y = 620;

const INK = 0x080806;
const GOLD = 0xf2e83f;
const PAPER = 0xf4efd2;
const GOLD_SOFT = 0xf8f09a;

const FONT_SERIF = 'Georgia, "Times New Roman", serif';
const FONT_SANS = '"Segoe UI", "Trebuchet MS", sans-serif';

const BASE_SCALE = 0.58;
const RUN_SPEED = 350;
const SPRINT_SPEED = 490;
const GROUND_ACCELERATION = 2800;
const AIR_ACCELERATION = 1600;
const GROUND_DRAG = 2600;
const AIR_DRAG = 260;
const JUMP_SPEED = 780;
const AIR_JUMP_SPEED = 720;
const MAX_FALL_SPEED = 1380;
const COYOTE_TIME_MS = 105;
const JUMP_BUFFER_MS = 125;

interface PlatformDef {
  x: number;
  y: number;
  width: number;
  height: number;
  floating?: boolean;
}

interface SparkDef {
  x: number;
  y: number;
}

const PLATFORMS: PlatformDef[] = [
  { x: 0, y: 610, width: 900, height: 170 },
  { x: 930, y: 548, width: 190, height: 40, floating: true },
  { x: 1200, y: 650, width: 540, height: 100 },
  { x: 1450, y: 520, width: 170, height: 36, floating: true },
  { x: 1740, y: 585, width: 160, height: 36, floating: true },
  { x: 1980, y: 620, width: 900, height: 130 },
];

const SPARKS: SparkDef[] = [
  { x: 560, y: 420 },
  { x: 1025, y: 360 },
  { x: 1535, y: 330 },
  { x: 1820, y: 380 },
  { x: 2255, y: 270 },
];

type GameKeys = {
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  shift: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
  r: Phaser.Input.Keyboard.Key;
  enter: Phaser.Input.Keyboard.Key;
};

export class GameScene extends Phaser.Scene {
  private hero!: Phaser.Physics.Arcade.Sprite;
  private heroOutline!: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: GameKeys;

  private platformZones: Phaser.GameObjects.Zone[] = [];
  private sparkZones: Phaser.GameObjects.Zone[] = [];
  private sparkHudText!: Phaser.GameObjects.Text;
  private gateStatusText!: Phaser.GameObjects.Text;
  private gatePortal!: Phaser.GameObjects.Graphics;
  private gateGlow!: Phaser.GameObjects.Arc;
  private gateOrb!: Phaser.GameObjects.Arc;
  private gateZone!: Phaser.GameObjects.Zone;

  private sparkCount = 0;
  private gateOpened = false;
  private finished = false;
  private toast?: Phaser.GameObjects.Container;

  private facing: 1 | -1 = 1;
  private lastGroundedAt = -Infinity;
  private jumpBufferedUntil = -Infinity;
  private jumpQueued = false;
  private jumpWasHeld = false;
  private airJumpAvailable = true;
  private wasOnGround = true;
  private priorFallSpeed = 0;
  private stepTimer = 0;
  private lastSafe = { x: START_X, y: START_Y };
  private nextSafeCheck = 0;
  private nextGateHintAt = 0;

  private isTouchDevice = false;
  private touchLeft = false;
  private touchRight = false;
  private touchJumpHeld = false;

  constructor() {
    super('game');
  }

  init(): void {
    this.platformZones = [];
    this.sparkZones = [];
    this.sparkCount = 0;
    this.gateOpened = false;
    this.finished = false;
    this.toast = undefined;
    this.facing = 1;
    this.lastGroundedAt = -Infinity;
    this.jumpBufferedUntil = -Infinity;
    this.jumpQueued = false;
    this.jumpWasHeld = false;
    this.airJumpAvailable = true;
    this.wasOnGround = true;
    this.priorFallSpeed = 0;
    this.stepTimer = 0;
    this.lastSafe = { x: START_X, y: START_Y };
    this.nextSafeCheck = 0;
    this.nextGateHintAt = 0;
    this.touchLeft = false;
    this.touchRight = false;
    this.touchJumpHeld = false;
  }

  preload(): void {
    const assets = `${import.meta.env.BASE_URL}assets/`;
    this.load.image('yellow-city', `${assets}yellow-city.jpg`);
    this.load.spritesheet('hero', `${assets}hero-run.png`, {
      frameWidth: 320,
      frameHeight: 360,
    });
    this.load.spritesheet('hero-outline', `${assets}hero-run-outline.png`, {
      frameWidth: 320,
      frameHeight: 360,
    });
  }

  create(): void {
    this.isTouchDevice =
      window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

    this.cameras.main.setBackgroundColor('#070703');
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, 900, true, true, true, false);

    if (!this.anims.exists('hero-run')) {
      this.anims.create({
        key: 'hero-run',
        frames: this.anims.generateFrameNumbers('hero', { start: 0, end: 7 }),
        frameRate: 13,
        repeat: -1,
      });
    }

    this.createBackdrop();
    this.createAmbientMotes();
    this.createPlatforms();
    this.createGate();
    this.createHero();
    this.createSparks();
    this.createColliders();
    this.createCamera();
    this.createInput();
    this.createInterface();
    this.createTouchControls();

    this.time.delayedCall(850, () => {
      this.showToast('FIND THE FIVE SPARKS  /  WAKE THE GATE', 3200);
    });

    this.cameras.main.fadeIn(700, 6, 6, 3);
    document.documentElement.classList.add('game-ready');
  }

  update(time: number): void {
    if (this.finished) {
      return;
    }

    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down || body.touching.down;

    if (onGround) {
      this.lastGroundedAt = time;
      this.airJumpAvailable = true;

      if (!this.wasOnGround && this.priorFallSpeed > 520) {
        this.spawnLandingBurst();
        this.cameras.main.shake(90, 0.0016);
      }
    }

    this.updateMovement(time, onGround);
    this.updateHeroAnimation(onGround);
    this.syncHeroOutline();
    this.updateSafePoint(time, onGround);

    if (this.hero.y > 810) {
      this.respawn();
    }

    this.priorFallSpeed = body.velocity.y;
    this.wasOnGround = onGround;
  }

  private createBackdrop(): void {
    const sourceAspect = 905 / 1200;
    const background = this.add
      .image(VIEW_WIDTH / 2, VIEW_HEIGHT / 2 + 4, 'yellow-city')
      .setDisplaySize(VIEW_WIDTH, VIEW_WIDTH * sourceAspect)
      .setScrollFactor(0)
      .setDepth(-100);

    this.tweens.add({
      targets: background,
      alpha: 0.965,
      duration: 7000,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    // A low, translucent bloom gives the hand-drawn city a little extra depth
    // behind the collision geometry.
    const haze = this.add.graphics().setDepth(-90).setScrollFactor(0.08);
    haze.fillStyle(GOLD, 0.014);
    haze.fillCircle(620, 430, 330);
  }

  private createAmbientMotes(): void {
    for (let index = 0; index < 26; index += 1) {
      const x = Phaser.Math.Between(30, WORLD_WIDTH - 30);
      const y = Phaser.Math.Between(95, 650);
      const radius = Phaser.Math.FloatBetween(1, 2.4);
      const mote = this.add
        .circle(x, y, radius, GOLD, Phaser.Math.FloatBetween(0.1, 0.38))
        .setDepth(3);

      this.tweens.add({
        targets: mote,
        x: x + Phaser.Math.Between(-35, 35),
        y: y - Phaser.Math.Between(14, 55),
        alpha: Phaser.Math.FloatBetween(0.04, 0.16),
        duration: Phaser.Math.Between(3500, 7200),
        delay: Phaser.Math.Between(0, 2200),
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private createPlatforms(): void {
    for (const platform of PLATFORMS) {
      this.drawPlatform(platform);

      const zone = this.add.zone(
        platform.x + platform.width / 2,
        platform.y + platform.height / 2,
        platform.width,
        platform.height,
      );
      this.physics.add.existing(zone, true);
      this.platformZones.push(zone);
    }
  }

  private drawPlatform(platform: PlatformDef): void {
    const { x, y, width, height, floating } = platform;
    const art = this.add.graphics().setDepth(5);

    // The warm lip keeps these foreground silhouettes separate from the
    // city's own black arches, even when the two overlap.
    art.fillStyle(GOLD, 0.06);
    art.fillRoundedRect(x + 8, y - 8, width - 16, 17, 8);
    art.fillStyle(0x0b0a05, 0.995);

    if (floating) {
      art.beginPath();
      art.moveTo(x + 9, y);
      art.lineTo(x + width - 9, y);
      art.lineTo(x + width, y + 9);
      art.lineTo(x + width, y + height);
      art.lineTo(x + width - 24, y + height);
      art.lineTo(x + width - 55, y + height + 22);
      art.lineTo(x + width - 86, y + height);
      art.lineTo(x + 78, y + height);
      art.lineTo(x + 40, y + height + 31);
      art.lineTo(x + 12, y + height);
      art.lineTo(x, y + height);
      art.lineTo(x, y + 9);
      art.closePath();
      art.fillPath();

      art.lineStyle(1, GOLD, 0.13);
      art.lineBetween(x + 20, y + 14, x + 20, y + height - 8);
      art.lineBetween(x + width - 20, y + 14, x + width - 20, y + height - 8);
    } else {
      art.fillRect(x, y, width, height);

      art.lineStyle(1, GOLD, 0.055);
      for (let lineX = x + 36; lineX < x + width - 20; lineX += 54) {
        art.lineBetween(lineX, y + 18, lineX, y + height - 6);
      }

      art.lineStyle(1, GOLD, 0.045);
      for (let lineY = y + 50; lineY < y + height; lineY += 46) {
        art.lineBetween(x + 16, lineY, x + width - 16, lineY);
      }
    }

    art.lineStyle(3, GOLD, 0.9);
    art.lineBetween(x + 10, y + 2, x + width - 10, y + 2);

    art.lineStyle(1, PAPER, 0.2);
    art.lineBetween(x + 14, y + 5, x + width - 14, y + 5);

    art.lineStyle(1, GOLD, 0.2);
    art.lineBetween(x + 16, y + 9, x + width - 16, y + 9);

    if (floating) {
      art.fillStyle(GOLD, 0.45);
      art.fillCircle(x + width - 55, y + height + 22, 1.8);
      art.fillCircle(x + 40, y + height + 31, 1.6);
    }
  }

  private createGate(): void {
    const baseY = GATE_BASE_Y;
    const centerX = GATE_X;
    const archTop = baseY - 348;
    const outerHalf = 112;

    this.gateGlow = this.add
      .circle(centerX, baseY - 148, 172, GOLD, 0.025)
      .setDepth(4)
      .setBlendMode(Phaser.BlendModes.ADD);

    const arch = this.add.graphics().setDepth(6);
    arch.fillStyle(INK, 0.97);
    arch.beginPath();
    arch.moveTo(centerX - outerHalf, baseY);
    arch.lineTo(centerX - outerHalf, baseY - 210);
    arch.lineTo(centerX - 62, baseY - 302);
    arch.lineTo(centerX, archTop);
    arch.lineTo(centerX + 62, baseY - 302);
    arch.lineTo(centerX + outerHalf, baseY - 210);
    arch.lineTo(centerX + outerHalf, baseY);
    arch.closePath();
    arch.fillPath();

    arch.lineStyle(2, GOLD, 0.38);
    arch.beginPath();
    arch.moveTo(centerX - outerHalf + 4, baseY - 4);
    arch.lineTo(centerX - outerHalf + 4, baseY - 207);
    arch.lineTo(centerX - 60, baseY - 298);
    arch.lineTo(centerX, archTop - 3);
    arch.lineTo(centerX + 60, baseY - 298);
    arch.lineTo(centerX + outerHalf - 4, baseY - 207);
    arch.lineTo(centerX + outerHalf - 4, baseY - 4);
    arch.strokePath();

    arch.lineStyle(1, GOLD, 0.13);
    arch.lineBetween(centerX - 80, baseY - 60, centerX - 80, baseY - 218);
    arch.lineBetween(centerX + 80, baseY - 60, centerX + 80, baseY - 218);
    arch.strokeCircle(centerX - 80, baseY - 170, 3);
    arch.strokeCircle(centerX + 80, baseY - 170, 3);

    this.gatePortal = this.add.graphics().setDepth(7).setAlpha(0.52);
    this.gatePortal.fillStyle(GOLD_SOFT, 0.28);
    this.gatePortal.beginPath();
    this.gatePortal.moveTo(centerX - 39, baseY);
    this.gatePortal.lineTo(centerX - 39, baseY - 194);
    this.gatePortal.lineTo(centerX, baseY - 278);
    this.gatePortal.lineTo(centerX + 39, baseY - 194);
    this.gatePortal.lineTo(centerX + 39, baseY);
    this.gatePortal.closePath();
    this.gatePortal.fillPath();

    this.gatePortal.lineStyle(1, GOLD, 0.45);
    this.gatePortal.lineBetween(centerX, baseY - 12, centerX, baseY - 242);

    const orbHalo = this.add
      .circle(centerX, archTop - 13, 25, GOLD, 0.075)
      .setDepth(7)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.gateOrb = this.add.circle(centerX, archTop - 13, 8, GOLD_SOFT, 0.44).setDepth(8);

    this.tweens.add({
      targets: orbHalo,
      scale: 1.25,
      alpha: 0.16,
      duration: 2200,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    this.gateZone = this.add.zone(centerX, baseY - 148, 172, 296);
    this.physics.add.existing(this.gateZone, true);
  }

  private createHero(): void {
    this.hero = this.physics.add
      .sprite(START_X, START_Y, 'hero', 0)
      .setOrigin(0.5, 1)
      .setScale(BASE_SCALE)
      .setDepth(10)
      .setCollideWorldBounds(true);

    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    body.setSize(74, 270);
    body.setOffset(123, 74);
    body.setMaxVelocity(SPRINT_SPEED, MAX_FALL_SPEED);
    body.setDrag(GROUND_DRAG, 0);

    this.heroOutline = this.add
      .sprite(START_X, START_Y + 1, 'hero-outline', 0)
      .setOrigin(0.5, 1)
      .setScale(BASE_SCALE)
      .setDepth(9)
      .setAlpha(0.66);

    this.hero.play('hero-run');
    this.hero.anims.stop();
    this.hero.setFrame(0);
    this.heroOutline.setFrame(0);
  }

  private createSparks(): void {
    for (const spark of SPARKS) {
      const halo = this.add.circle(0, 0, 25, GOLD, 0.07);
      const outer = this.add.star(0, 0, 4, 6, 20, GOLD, 0.28);
      const star = this.add
        .star(0, 0, 4, 4, 14, GOLD_SOFT, 1)
        .setStrokeStyle(2, INK, 0.95);
      const center = this.add.circle(0, 0, 2.8, INK, 1);

      const visual = this.add
        .container(spark.x, spark.y, [halo, outer, star, center])
        .setDepth(12);

      this.tweens.add({
        targets: visual,
        y: spark.y - 8,
        duration: Phaser.Math.Between(1200, 1850),
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
      this.tweens.add({
        targets: outer,
        angle: 90,
        duration: Phaser.Math.Between(4200, 6500),
        ease: 'Linear',
        repeat: -1,
      });
      this.tweens.add({
        targets: halo,
        scale: 1.18,
        alpha: 0.025,
        duration: Phaser.Math.Between(900, 1400),
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });

      const zone = this.add.zone(spark.x, spark.y, 58, 58);
      this.physics.add.existing(zone, true);
      zone.setData('visual', visual);
      zone.setData('collected', false);
      this.sparkZones.push(zone);
    }
  }

  private createColliders(): void {
    for (const platform of this.platformZones) {
      this.physics.add.collider(this.hero, platform);
    }

    for (const spark of this.sparkZones) {
      this.physics.add.overlap(this.hero, spark, () => {
        this.collectSpark(spark);
      });
    }

    this.physics.add.overlap(this.hero, this.gateZone, () => {
      this.tryEnterGate();
    });
  }

  private createCamera(): void {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, WORLD_WIDTH, VIEW_HEIGHT);
    camera.setDeadzone(210, 100);
    camera.startFollow(this.hero, false, 0.075, 0.1);
  }

  private createInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }

    this.cursors = keyboard.createCursorKeys();
    this.keys = keyboard.addKeys({
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      r: Phaser.Input.Keyboard.KeyCodes.R,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
    }) as GameKeys;

    const queueJump = (): void => {
      this.jumpQueued = true;
    };

    keyboard.on('keydown-SPACE', queueJump);
    keyboard.on('keydown-UP', queueJump);
    keyboard.on('keydown-W', queueJump);

    keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    ]);
  }

  private createInterface(): void {
    const interfaceDepth = 100;
    const shade = this.add.graphics().setScrollFactor(0).setDepth(interfaceDepth - 10);
    shade.fillGradientStyle(0x070703, 0x070703, 0x070703, 0x070703, 0.68, 0.68, 0, 0);
    shade.fillRect(0, 0, VIEW_WIDTH, 142);
    shade.fillGradientStyle(0x070703, 0x070703, 0x070703, 0x070703, 0, 0, 0.46, 0.46);
    shade.fillRect(0, VIEW_HEIGHT - 92, VIEW_WIDTH, 92);

    this.add
      .text(52, 32, 'A HAND-DRAWN MOVEMENT STUDY', {
        fontFamily: FONT_SANS,
        fontSize: '10px',
        color: '#f2e83f',
      })
      .setAlpha(0.64)
      .setLetterSpacing(2.6)
      .setScrollFactor(0)
      .setDepth(interfaceDepth);

    this.add
      .text(49, 47, 'The Yellow City', {
        fontFamily: FONT_SERIF,
        fontSize: '38px',
        color: '#f4efd2',
      })
      .setLetterSpacing(-1.2)
      .setScrollFactor(0)
      .setDepth(interfaceDepth);

    this.add
      .text(52, 92, 'Find the five sparks. Wake the gate.', {
        fontFamily: FONT_SERIF,
        fontSize: '14px',
        color: '#f4efd2',
        fontStyle: 'italic',
      })
      .setAlpha(0.5)
      .setScrollFactor(0)
      .setDepth(interfaceDepth);

    this.add
      .rectangle(52, 119, 42, 1, GOLD, 0.65)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(interfaceDepth);

    this.add
      .text(1228, 33, 'SPARKS', {
        fontFamily: FONT_SANS,
        fontSize: '9px',
        color: '#f2e83f',
      })
      .setOrigin(1, 0)
      .setAlpha(0.62)
      .setLetterSpacing(2.8)
      .setScrollFactor(0)
      .setDepth(interfaceDepth);

    this.add
      .star(1114, 53, 4, 3, 8, GOLD, 0.78)
      .setScrollFactor(0)
      .setDepth(interfaceDepth);

    this.sparkHudText = this.add
      .text(1228, 48, '00 / 05', {
        fontFamily: FONT_SERIF,
        fontSize: '24px',
        color: '#f4efd2',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(interfaceDepth);

    this.gateStatusText = this.add
      .text(1228, 84, 'THE GATE IS CLOSED', {
        fontFamily: FONT_SANS,
        fontSize: '8px',
        color: '#f4efd2',
      })
      .setOrigin(1, 0)
      .setAlpha(0.5)
      .setLetterSpacing(2)
      .setScrollFactor(0)
      .setDepth(interfaceDepth);

    this.add
      .rectangle(1084, 33, 1, 61, GOLD, 0.13)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(interfaceDepth);

    if (!this.isTouchDevice) {
      const hint = this.add.graphics().setScrollFactor(0).setDepth(interfaceDepth);
      hint.fillStyle(0x050502, 0.56);
      hint.fillRoundedRect(52, 651, 550, 36, 18);
      hint.lineStyle(1, GOLD, 0.12);
      hint.strokeRoundedRect(52, 651, 550, 36, 18);

      this.add
        .text(72, 662, 'A / D   MOVE        SPACE   JUMP x2        SHIFT   SPRINT', {
          fontFamily: FONT_SANS,
          fontSize: '9px',
          color: '#f4efd2',
        })
        .setAlpha(0.6)
        .setLetterSpacing(1.4)
        .setScrollFactor(0)
        .setDepth(interfaceDepth + 1);
    }
  }

  private createTouchControls(): void {
    if (!this.isTouchDevice) {
      return;
    }

    const buttons = [
      this.createTouchButton(92, 638, 36, 'left'),
      this.createTouchButton(184, 638, 36, 'right'),
      this.createTouchButton(1174, 630, 44, 'jump'),
    ];

    const resetTouchInput = (): void => {
      this.touchLeft = false;
      this.touchRight = false;
      this.touchJumpHeld = false;
      this.jumpQueued = false;
      for (const button of buttons) {
        button.setFillStyle(0x070703, 0.36);
      }
    };

    this.game.events.on(Phaser.Core.Events.BLUR, resetTouchInput);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, resetTouchInput);
    });

    this.add
      .text(138, 687, 'MOVE', {
        fontFamily: FONT_SANS,
        fontSize: '8px',
        color: '#f4efd2',
      })
      .setOrigin(0.5)
      .setAlpha(0.38)
      .setLetterSpacing(2)
      .setScrollFactor(0)
      .setDepth(112);

    this.add
      .text(1174, 687, 'JUMP', {
        fontFamily: FONT_SANS,
        fontSize: '8px',
        color: '#f4efd2',
      })
      .setOrigin(0.5)
      .setAlpha(0.38)
      .setLetterSpacing(2)
      .setScrollFactor(0)
      .setDepth(112);
  }

  private createTouchButton(
    x: number,
    y: number,
    radius: number,
    action: 'left' | 'right' | 'jump',
  ): Phaser.GameObjects.Arc {
    const button = this.add
      .circle(x, y, radius, 0x070703, 0.36)
      .setStrokeStyle(1.5, GOLD, 0.32)
      .setScrollFactor(0)
      .setDepth(111)
      .setInteractive({ useHandCursor: false });

    const icon = this.add.graphics().setScrollFactor(0).setDepth(112);
    icon.fillStyle(GOLD, 0.72);

    if (action === 'left') {
      icon.beginPath();
      icon.moveTo(x - 7, y);
      icon.lineTo(x + 5, y - 9);
      icon.lineTo(x + 5, y + 9);
      icon.closePath();
      icon.fillPath();
    } else if (action === 'right') {
      icon.beginPath();
      icon.moveTo(x + 7, y);
      icon.lineTo(x - 5, y - 9);
      icon.lineTo(x - 5, y + 9);
      icon.closePath();
      icon.fillPath();
    } else {
      icon.beginPath();
      icon.moveTo(x, y - 11);
      icon.lineTo(x + 11, y + 5);
      icon.lineTo(x - 11, y + 5);
      icon.closePath();
      icon.fillPath();
      icon.lineStyle(1.5, GOLD, 0.6);
      icon.lineBetween(x - 8, y + 12, x + 8, y + 12);
    }

    const release = (): void => {
      button.setFillStyle(0x070703, 0.36);
      if (action === 'left') {
        this.touchLeft = false;
      } else if (action === 'right') {
        this.touchRight = false;
      } else {
        this.touchJumpHeld = false;
      }
    };

    button.on('pointerdown', () => {
      button.setFillStyle(0x2b2807, 0.72);
      if (action === 'left') {
        this.touchLeft = true;
      } else if (action === 'right') {
        this.touchRight = true;
      } else {
        this.touchJumpHeld = true;
        this.jumpQueued = true;
      }
    });
    button.on('pointerup', release);
    button.on('pointerout', release);
    button.on('pointerupoutside', release);

    return button;
  }

  private updateMovement(time: number, onGround: boolean): void {
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    const leftDown = this.cursors.left.isDown || this.keys.a.isDown || this.touchLeft;
    const rightDown = this.cursors.right.isDown || this.keys.d.isDown || this.touchRight;
    const sprintDown = this.cursors.shift.isDown || this.keys.shift.isDown;
    const direction = Number(rightDown) - Number(leftDown);
    const jumpPressed = this.jumpQueued;
    const jumpHeld =
      this.cursors.space.isDown ||
      this.cursors.up.isDown ||
      this.keys.space.isDown ||
      this.keys.w.isDown ||
      this.touchJumpHeld;

    this.jumpQueued = false;

    if (direction !== 0) {
      const turning = body.velocity.x !== 0 && Math.sign(body.velocity.x) !== direction;
      const acceleration = onGround
        ? GROUND_ACCELERATION * (turning ? 1.5 : 1)
        : AIR_ACCELERATION;
      body.setAccelerationX(direction * acceleration);
      body.setDragX(0);
      this.facing = direction > 0 ? 1 : -1;
      this.hero.setFlipX(this.facing < 0);
    } else {
      body.setAccelerationX(0);
      body.setDragX(onGround ? GROUND_DRAG : AIR_DRAG);
    }

    body.setMaxVelocity(sprintDown ? SPRINT_SPEED : RUN_SPEED, MAX_FALL_SPEED);

    if (jumpPressed) {
      this.jumpBufferedUntil = time + JUMP_BUFFER_MS;
    }

    if (time <= this.jumpBufferedUntil) {
      const withinCoyoteTime = time - this.lastGroundedAt <= COYOTE_TIME_MS;

      if (onGround || withinCoyoteTime) {
        this.performJump(false);
        this.jumpBufferedUntil = -Infinity;
      } else if (jumpPressed && this.airJumpAvailable) {
        this.airJumpAvailable = false;
        this.performJump(true);
        this.jumpBufferedUntil = -Infinity;
      }
    }

    if (this.jumpWasHeld && !jumpHeld && body.velocity.y < -220) {
      body.setVelocityY(body.velocity.y * 0.46);
    }
    this.jumpWasHeld = jumpHeld;

    if (onGround && Math.abs(body.velocity.x) > 80) {
      this.stepTimer += this.game.loop.delta;
      const stepInterval = sprintDown ? 100 : 150;
      if (this.stepTimer >= stepInterval) {
        this.stepTimer = 0;
        this.spawnFootstepDust();
      }
    } else {
      this.stepTimer = 0;
    }
  }

  private performJump(isAirJump: boolean): void {
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    body.setVelocityY(isAirJump ? AIR_JUMP_SPEED * -1 : JUMP_SPEED * -1);
    this.lastGroundedAt = -Infinity;
    this.spawnJumpBurst(isAirJump);
  }

  private updateHeroAnimation(onGround: boolean): void {
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    const speed = Math.abs(body.velocity.x);

    if (!onGround) {
      if (this.hero.anims.isPlaying) {
        this.hero.anims.stop();
      }

      const frame = body.velocity.y < -80 ? 4 : body.velocity.y > 120 ? 6 : 5;
      if (this.hero.frame.name !== String(frame)) {
        this.hero.setFrame(frame);
      }

      const targetAngle = Phaser.Math.Clamp(body.velocity.y / 115, -5, 7) * this.facing;
      this.hero.setAngle(Phaser.Math.Linear(this.hero.angle, targetAngle, 0.16));
    } else {
      if (speed > 25) {
        if (!this.hero.anims.isPlaying || this.hero.anims.currentAnim?.key !== 'hero-run') {
          this.hero.play('hero-run');
        }
        this.hero.anims.timeScale = Phaser.Math.Clamp(speed / 290, 0.68, 1.65);
      } else {
        if (this.hero.anims.isPlaying) {
          this.hero.anims.stop();
        }
        if (this.hero.frame.name !== '0') {
          this.hero.setFrame(0);
        }
      }

      this.hero.setAngle(Phaser.Math.Linear(this.hero.angle, 0, 0.24));
    }

    // A little running lean keeps the pose alive without touching the hitbox.
    if (onGround) {
      const lean = Phaser.Math.Clamp(speed / RUN_SPEED, 0, 1) * 2.4 * this.facing;
      this.hero.setAngle(Phaser.Math.Linear(this.hero.angle, lean, 0.08));
    }
  }

  private syncHeroOutline(): void {
    this.heroOutline
      .setPosition(this.hero.x, this.hero.y + 1)
      .setFrame(this.hero.frame.name)
      .setFlipX(this.hero.flipX)
      .setAngle(this.hero.angle)
      .setScale(this.hero.scaleX, this.hero.scaleY);
  }

  private spawnFootstepDust(): void {
    const direction = Math.sign(this.hero.body?.velocity.x ?? this.facing) || this.facing;
    const x = this.hero.x - direction * 18 + Phaser.Math.Between(-5, 5);
    const y = this.hero.y - Phaser.Math.Between(1, 7);
    const dust = this.add
      .ellipse(x, y, Phaser.Math.Between(7, 12), 3, GOLD, Phaser.Math.FloatBetween(0.16, 0.32))
      .setDepth(6);

    this.tweens.add({
      targets: dust,
      x: x - direction * Phaser.Math.Between(20, 36),
      y: y - Phaser.Math.Between(10, 24),
      scaleX: 2.4,
      scaleY: 1.8,
      alpha: 0,
      duration: Phaser.Math.Between(330, 520),
      ease: 'Cubic.easeOut',
      onComplete: () => dust.destroy(),
    });
  }

  private spawnJumpBurst(isAirJump: boolean): void {
    const x = this.hero.x;
    const y = this.hero.y - 4;
    const ring = this.add
      .ellipse(x, y, 26, 9)
      .setStrokeStyle(1.5, GOLD, isAirJump ? 0.7 : 0.5)
      .setDepth(13);

    this.tweens.add({
      targets: ring,
      scaleX: 2.8,
      scaleY: 2.2,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });

    const count = isAirJump ? 9 : 5;
    for (let index = 0; index < count; index += 1) {
      const angle = Phaser.Math.FloatBetween(Math.PI * 0.15, Math.PI * 0.85);
      const distance = Phaser.Math.Between(22, isAirJump ? 54 : 38);
      const particle = this.add
        .circle(x + Phaser.Math.Between(-8, 8), y, Phaser.Math.FloatBetween(1, 2.2), GOLD_SOFT, 0.7)
        .setDepth(13);

      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * distance,
        y: y - Math.sin(angle) * distance,
        alpha: 0,
        duration: Phaser.Math.Between(280, 480),
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  private spawnLandingBurst(): void {
    const x = this.hero.x;
    const y = this.hero.y - 2;
    const ring = this.add
      .ellipse(x, y, 32, 11)
      .setStrokeStyle(2, GOLD, 0.45)
      .setDepth(13);

    this.tweens.add({
      targets: ring,
      scaleX: 3.7,
      scaleY: 2.8,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });

    for (let index = 0; index < 7; index += 1) {
      const direction = index % 2 === 0 ? -1 : 1;
      const dust = this.add
        .ellipse(x, y, Phaser.Math.Between(6, 13), 3, GOLD, 0.25)
        .setDepth(6);

      this.tweens.add({
        targets: dust,
        x: x + direction * Phaser.Math.Between(26, 70),
        y: y - Phaser.Math.Between(7, 20),
        scaleX: 2.2,
        alpha: 0,
        duration: Phaser.Math.Between(380, 600),
        ease: 'Cubic.easeOut',
        onComplete: () => dust.destroy(),
      });
    }
  }

  private collectSpark(zone: Phaser.GameObjects.Zone): void {
    if (zone.getData('collected')) {
      return;
    }

    zone.setData('collected', true);
    const body = zone.body as Phaser.Physics.Arcade.StaticBody | null;
    if (body) {
      body.enable = false;
    }

    const visual = zone.getData('visual') as Phaser.GameObjects.Container;
    const originX = visual.x;
    const originY = visual.y;
    this.sparkCount += 1;
    this.updateSparkHud();
    this.cameras.main.flash(130, 244, 236, 80, false);

    this.tweens.add({
      targets: visual,
      y: originY - 36,
      scale: 2,
      alpha: 0,
      duration: 360,
      ease: 'Cubic.easeOut',
      onComplete: () => visual.destroy(),
    });

    const ripple = this.add
      .circle(originX, originY, 12)
      .setStrokeStyle(2, GOLD, 0.72)
      .setDepth(14);
    this.tweens.add({
      targets: ripple,
      scale: 4.5,
      alpha: 0,
      duration: 460,
      ease: 'Cubic.easeOut',
      onComplete: () => ripple.destroy(),
    });

    for (let index = 0; index < 12; index += 1) {
      const angle = (Math.PI * 2 * index) / 12 + Phaser.Math.FloatBetween(-0.2, 0.2);
      const distance = Phaser.Math.Between(28, 76);
      const shard = this.add
        .star(originX, originY, 4, 1.5, 5.5, GOLD_SOFT, 0.85)
        .setDepth(14);

      this.tweens.add({
        targets: shard,
        x: originX + Math.cos(angle) * distance,
        y: originY + Math.sin(angle) * distance - 12,
        angle: Phaser.Math.Between(-180, 180),
        alpha: 0,
        duration: Phaser.Math.Between(380, 650),
        ease: 'Cubic.easeOut',
        onComplete: () => shard.destroy(),
      });
    }

    if (this.sparkCount === SPARKS.length) {
      this.openGate();
    }
  }

  private updateSparkHud(): void {
    this.sparkHudText.setText(
      `${String(this.sparkCount).padStart(2, '0')} / ${String(SPARKS.length).padStart(2, '0')}`,
    );
    this.tweens.killTweensOf(this.sparkHudText);
    this.sparkHudText.setScale(1.16);
    this.tweens.add({
      targets: this.sparkHudText,
      scale: 1,
      duration: 260,
      ease: 'Back.easeOut',
    });
  }

  private openGate(): void {
    if (this.gateOpened) {
      return;
    }

    this.gateOpened = true;
    this.gateStatusText.setText('THE GATE IS OPEN').setColor('#f8f09a').setAlpha(0.82);
    this.showToast('FIVE SPARKS FOUND  /  THE GATE IS OPEN', 2800);
    this.cameras.main.flash(240, 244, 235, 80, false);

    this.tweens.add({
      targets: this.gatePortal,
      alpha: 1,
      duration: 850,
      ease: 'Sine.easeOut',
    });
    this.tweens.add({
      targets: this.gateGlow,
      alpha: 0.19,
      scale: 1.28,
      duration: 850,
      ease: 'Sine.easeOut',
    });
    this.tweens.add({
      targets: this.gateOrb,
      alpha: 1,
      scale: 1.42,
      duration: 480,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  private tryEnterGate(): void {
    if (this.finished) {
      return;
    }

    if (!this.gateOpened) {
      if (this.time.now >= this.nextGateHintAt) {
        this.nextGateHintAt = this.time.now + 3200;
        const remaining = SPARKS.length - this.sparkCount;
        this.showToast(
          `${remaining} ${remaining === 1 ? 'SPARK' : 'SPARKS'} STILL LOST IN THE CITY`,
          2200,
        );
      }
      return;
    }

    this.finishGame();
  }

  private finishGame(): void {
    if (this.finished) {
      return;
    }

    this.finished = true;
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.setAcceleration(0, 0);
    body.moves = false;

    this.tweens.add({
      targets: [this.hero, this.heroOutline],
      alpha: 0.35,
      duration: 700,
      ease: 'Sine.easeOut',
    });
    this.cameras.main.flash(360, 246, 239, 150, false);

    this.time.delayedCall(650, () => {
      this.showEndCard();
    });
  }

  private showEndCard(): void {
    const overlay = this.add.container(0, 0).setScrollFactor(0).setDepth(220).setAlpha(0);
    const veil = this.add.rectangle(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, VIEW_WIDTH, VIEW_HEIGHT, 0x070703, 0.9);

    const frame = this.add.graphics();
    frame.lineStyle(1, GOLD, 0.22);
    frame.strokeRect(34, 34, VIEW_WIDTH - 68, VIEW_HEIGHT - 68);
    frame.lineStyle(1, GOLD, 0.08);
    frame.strokeRect(44, 44, VIEW_WIDTH - 88, VIEW_HEIGHT - 88);

    const kicker = this.add
      .text(VIEW_WIDTH / 2, 206, 'THE GATE IS OPEN', {
        fontFamily: FONT_SANS,
        fontSize: '10px',
        color: '#f2e83f',
      })
      .setOrigin(0.5)
      .setLetterSpacing(4);

    const title = this.add
      .text(VIEW_WIDTH / 2, 237, 'The city remembers.', {
        fontFamily: FONT_SERIF,
        fontSize: '56px',
        color: '#f4efd2',
      })
      .setOrigin(0.5)
      .setLetterSpacing(-1.8);

    const rule = this.add.rectangle(VIEW_WIDTH / 2, 310, 46, 2, GOLD, 1);

    const description = this.add
      .text(
        VIEW_WIDTH / 2,
        338,
        'Five sparks found. Every arch in the city is awake again.',
        {
          fontFamily: FONT_SERIF,
          fontSize: '18px',
          color: '#f4efd2',
          fontStyle: 'italic',
        },
      )
      .setOrigin(0.5)
      .setAlpha(0.62);

    const button = this.add
      .rectangle(VIEW_WIDTH / 2, 440, 216, 52, GOLD, 1)
      .setInteractive({ useHandCursor: true });
    const buttonText = this.add
      .text(VIEW_WIDTH / 2, 440, 'RUN AGAIN', {
        fontFamily: FONT_SANS,
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#070703',
      })
      .setOrigin(0.5)
      .setLetterSpacing(2.4);

    const hint = this.add
      .text(VIEW_WIDTH / 2, 518, 'OR PRESS R', {
        fontFamily: FONT_SANS,
        fontSize: '9px',
        color: '#f4efd2',
      })
      .setOrigin(0.5)
      .setAlpha(0.34)
      .setLetterSpacing(2.4);

    overlay.add([veil, frame, kicker, title, rule, description, button, buttonText, hint]);
    this.tweens.add({
      targets: overlay,
      alpha: 1,
      duration: 550,
      ease: 'Sine.easeOut',
    });

    const restart = (): void => {
      this.scene.restart();
    };

    button.on('pointerover', () => button.setFillStyle(0xfbf7c2, 1));
    button.on('pointerout', () => button.setFillStyle(GOLD, 1));
    button.on('pointerdown', restart);

    if (this.input.keyboard) {
      this.input.keyboard.once('keydown-R', restart);
      this.input.keyboard.once('keydown-ENTER', restart);
    }
  }

  private updateSafePoint(time: number, onGround: boolean): void {
    if (onGround && time >= this.nextSafeCheck) {
      this.lastSafe.x = this.hero.x;
      this.lastSafe.y = this.hero.y;
      this.nextSafeCheck = time + 280;
    }
  }

  private respawn(): void {
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    this.cameras.main.flash(180, 244, 233, 80, false);
    body.reset(this.lastSafe.x, this.lastSafe.y - 16);
    body.setVelocity(0, 0);
    this.lastGroundedAt = -Infinity;
    this.airJumpAvailable = true;
    this.jumpBufferedUntil = -Infinity;
    this.wasOnGround = false;
    this.priorFallSpeed = 0;
  }

  private showToast(message: string, duration: number): void {
    this.toast?.destroy();

    const container = this.add
      .container(VIEW_WIDTH / 2, 166, [])
      .setScrollFactor(0)
      .setDepth(160)
      .setAlpha(0);
    const text = this.add
      .text(0, 0, message, {
        fontFamily: FONT_SANS,
        fontSize: '9px',
        color: '#f4efd2',
      })
      .setOrigin(0.5)
      .setLetterSpacing(2.2);

    const paddingX = 25;
    const panel = this.add.graphics();
    panel.fillStyle(0x070703, 0.82);
    panel.fillRoundedRect(-text.width / 2 - paddingX, -18, text.width + paddingX * 2, 36, 18);
    panel.lineStyle(1, GOLD, 0.26);
    panel.strokeRoundedRect(-text.width / 2 - paddingX, -18, text.width + paddingX * 2, 36, 18);

    container.add([panel, text]);
    this.toast = container;

    this.tweens.add({
      targets: container,
      y: 158,
      alpha: 1,
      duration: 320,
      ease: 'Cubic.easeOut',
    });
    this.tweens.add({
      targets: container,
      alpha: 0,
      delay: duration,
      duration: 500,
      ease: 'Sine.easeIn',
      onComplete: () => {
        container.destroy();
        if (this.toast === container) {
          this.toast = undefined;
        }
      },
    });
  }
}
