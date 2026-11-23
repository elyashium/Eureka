import Phaser from 'phaser';
import './style.css';
import { GameScene } from './game/GameScene';

const debugPhysics = new URLSearchParams(window.location.search).has('debug');

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#070703',
  banner: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 2050 },
      debug: debugPhysics,
    },
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
  },
  input: {
    activePointers: 4,
  },
  scene: [GameScene],
};

const game = new Phaser.Game(config);

if (import.meta.env.DEV) {
  (window as unknown as { yellowCityGame: Phaser.Game }).yellowCityGame = game;
}
