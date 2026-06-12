import Phaser from 'phaser';

const JUMP_VEL = -680;
const MAX_JUMPS = 2; // 2단 점프 허용 횟수

// 에스컬레이션 튜닝 (더러운 프로토 — 막 만져도 됨)
const OBS_SPEED_BASE = 290; // 시작 속도
const OBS_SPEED_RAMP = 13; // 초당 속도 증가량 (px/s per s)
const OBS_INTERVAL_BASE = 1500; // 시작 스폰 간격(ms)
const OBS_INTERVAL_MIN = 620; // 스폰 간격 하한
const OBS_INTERVAL_RAMP = 28; // 초당 간격 단축량(ms per s)

// 니어미스 튜닝
const NEAR_MISS_PX = 52; // 발끝-장애물 윗면 간격이 이 이하면 "아슬아슬"
const NEAR_MISS_HEAL = 5; // 니어미스 성공 시 체력 보너스

// 거리 점수
const PIXELS_PER_METER = 30; // 픽셀→미터 환산 비율

// 체력 시스템 튜닝
const HP_MAX = 100;
const HP_DRAIN_PER_SEC = 4; // 초당 자연 감소량
const HIT_DAMAGE = 35; // 장애물 충돌 데미지
const HIT_INVINCIBLE_MS = 600; // 피격 후 무적 시간(ms)
const POTION_HEAL = 30; // 포션 회복량
const POTION_CHANCE = 0.35; // 장애물 스폰 1회당 포션 등장 확률

class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private ground!: Phaser.GameObjects.Rectangle;
  private obstacles!: Phaser.Physics.Arcade.Group;
  private groundY!: number;
  private dead = false;

  // 게임 시작 시각 (ms) — 생존 시간 / 난이도 계산용
  private startTime = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;

  // 니어미스 콤보
  private nearMisses = 0;

  // 2단 점프: 착지 이후 사용한 점프 횟수 (착지 시 0으로 리셋)
  private jumpsUsed = 0;

  // 체력 / 거리
  private hp = HP_MAX;
  private invincibleUntil = 0; // 이 시각(time.now)까지 피격 무시
  private distance = 0; // 누적 주행 거리 (미터)
  private potions!: Phaser.Physics.Arcade.Group;
  private hpFill!: Phaser.GameObjects.Rectangle;

  private gameOverGroup!: Phaser.GameObjects.Group;

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    const { width, height } = this.scale;
    this.groundY = height * 0.78;
    this.dead = false;
    this.startTime = this.time.now;
    this.nearMisses = 0;
    this.jumpsUsed = 0;
    this.hp = HP_MAX;
    this.invincibleUntil = 0;
    this.distance = 0;

    // 바닥: 상단 엣지가 groundY에 정렬
    this.ground = this.add.rectangle(width / 2, this.groundY + 10, width, 20, 0x8892b0);
    this.physics.add.existing(this.ground, true);

    // 플레이어 (40×48), 바닥에 밀착
    const pw = 40, ph = 48;
    this.player = this.add.rectangle(width * 0.18, this.groundY - ph / 2, pw, ph, 0x64ffda);
    this.physics.add.existing(this.player);
    const pb = this.player.body as Phaser.Physics.Arcade.Body;
    pb.setGravityY(1400);
    this.physics.add.collider(this.player, this.ground);

    // 장애물 그룹 — overlap 시 피격 처리 (무적 중이면 무시)
    this.obstacles = this.physics.add.group();
    this.physics.add.overlap(this.player, this.obstacles, () => this.onHit(), undefined, this);

    // 체력포션 그룹 — 닿으면 회복
    this.potions = this.physics.add.group();
    this.physics.add.overlap(
      this.player,
      this.potions,
      (_pl, potion) => this.collectPotion(potion as unknown as Phaser.GameObjects.Arc),
      undefined,
      this,
    );

    // 자기-재예약 스폰: 매번 현재 난이도로 다음 딜레이를 다시 계산
    this.scheduleNextSpawn();

    // 거리 점수 표시 (우상단)
    this.scoreText = this.add
      .text(width - 24, 24, '0M', { fontSize: '28px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(1, 0);

    // 체력바 (상단 중앙): 어두운 배경 위에 채움 막대
    const barW = 220, barH = 16;
    this.add.rectangle(width / 2, 32, barW + 4, barH + 4, 0x000000, 0.5);
    // 왼쪽 기준(origin 0)으로 줄어들도록 — scaleX로 체력 비율 표현
    this.hpFill = this.add
      .rectangle(width / 2 - barW / 2, 32, barW, barH, 0x2ecc71)
      .setOrigin(0, 0.5);

    // 니어미스 콤보 표시 (좌상단)
    this.comboText = this.add
      .text(24, 24, '', { fontSize: '20px', color: '#ffd166', fontStyle: 'bold' })
      .setOrigin(0, 0);

    // 게임오버 UI를 담을 그룹 (처음엔 비어 있음)
    this.gameOverGroup = this.add.group();

    this.input.on('pointerdown', this.onTap, this);
  }

  // 현재 생존 시간 기반 난이도 헬퍼
  private elapsedSec(): number {
    return (this.time.now - this.startTime) / 1000;
  }

  private currentSpeed(): number {
    return OBS_SPEED_BASE + this.elapsedSec() * OBS_SPEED_RAMP;
  }

  private currentInterval(): number {
    return Math.max(OBS_INTERVAL_MIN, OBS_INTERVAL_BASE - this.elapsedSec() * OBS_INTERVAL_RAMP);
  }

  private scheduleNextSpawn() {
    if (this.dead) return;
    this.time.addEvent({
      delay: this.currentInterval(),
      callback: () => {
        this.spawnObstacle();
        // 확률적으로 장애물과 장애물 사이 지점에 포션 등장
        if (Math.random() < POTION_CHANCE) {
          this.time.delayedCall(this.currentInterval() / 2, () => this.spawnPotion());
        }
        this.scheduleNextSpawn(); // 다음 스폰을 갱신된 간격으로 재예약
      },
    });
  }

  private onTap() {
    if (this.dead) {
      this.scene.restart();
      return;
    }
    const pb = this.player.body as Phaser.Physics.Arcade.Body;
    // 점프 횟수가 남아 있으면 점프 (지상 1단 + 공중 1단 = 최대 2단)
    // 리셋은 update의 '착지 판정'에서만 — 여기서 리셋하면 이륙 직후 잔여 접촉으로 3단이 됨
    if (this.jumpsUsed < MAX_JUMPS) {
      pb.setVelocityY(JUMP_VEL);
      this.jumpsUsed += 1;
    }
  }

  private spawnObstacle() {
    if (this.dead) return;
    const { width } = this.scale;
    const h = Phaser.Math.Between(40, 90);
    // 오른쪽 바깥에서 스폰 후 왼쪽으로 이동
    const obs = this.add.rectangle(width + 25, this.groundY - h / 2, 28, h, 0xff6b6b);
    // 주의: Arcade 그룹은 add 시점에 그룹 기본값(velocity=0, allowGravity=true 등)으로
    // body를 덮어쓰므로, 속도 설정은 반드시 그룹에 추가한 '이후'에 해야 한다
    this.obstacles.add(obs);
    const body = obs.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(-this.currentSpeed()); // 갈수록 빨라짐
    body.setAllowGravity(false);
    // 니어미스 판정용 메타: 아직 통과/평가 안 됨, 장애물 높이 기록
    obs.setData('scored', false);
    obs.setData('topY', this.groundY - h); // 윗면 y
  }

  private spawnPotion() {
    if (this.dead) return;
    const { width } = this.scale;
    // 점프 궤적으로 닿을 수 있는 랜덤 높이
    const y = Phaser.Math.Between(this.groundY - 230, this.groundY - 70);
    const potion = this.add.circle(width + 25, y, 13, 0x4dabf7);
    // 장애물과 동일한 함정 주의: 그룹 추가 '이후'에 속도 설정
    this.potions.add(potion);
    const body = potion.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(-this.currentSpeed());
    body.setAllowGravity(false);
  }

  private collectPotion(potion: Phaser.GameObjects.Arc) {
    potion.destroy();
    this.heal(POTION_HEAL);
    this.popupText(this.player.x, this.player.y - 50, '+HP', '#4dabf7');
  }

  private heal(amount: number) {
    this.hp = Math.min(HP_MAX, this.hp + amount);
  }

  private onHit() {
    if (this.dead) return;
    if (this.time.now < this.invincibleUntil) return; // 무적 중이면 무시

    this.hp -= HIT_DAMAGE;
    this.invincibleUntil = this.time.now + HIT_INVINCIBLE_MS;

    // 빨강 플래시 + 무적 시간 동안 반투명 깜빡임
    this.cameras.main.flash(140, 255, 70, 70);
    this.tweens.add({
      targets: this.player,
      alpha: 0.3,
      duration: 100,
      yoyo: true,
      repeat: Math.floor(HIT_INVINCIBLE_MS / 200) - 1,
      onComplete: () => this.player.setAlpha(1),
    });

    if (this.hp <= 0) {
      this.hp = 0;
      this.gameOver();
    }
  }

  update(_time: number, delta: number) {
    if (this.dead) return;

    // 거리 누적: 현재 스크롤 속도 × 경과 시간 → 미터 환산
    this.distance += (this.currentSpeed() * delta) / 1000 / PIXELS_PER_METER;
    this.scoreText.setText(`${Math.floor(this.distance)}M`);

    // 체력 자연 감소 → 0이면 게임오버
    this.hp = Math.max(0, this.hp - (HP_DRAIN_PER_SEC * delta) / 1000);
    this.renderHpBar();
    if (this.hp <= 0) {
      this.gameOver();
      return;
    }

    // 화면 밖으로 나간 포션 제거
    for (const child of this.potions.getChildren()) {
      const c = child as Phaser.GameObjects.Arc;
      if (c.x < -60) c.destroy();
    }

    const playerBottom = this.player.y + (this.player.height as number) / 2;
    const pb = this.player.body as Phaser.Physics.Arcade.Body;
    const airborne = !pb.blocked.down;
    // 착지 판정: 바닥에 닿아 있고 '하강/정지' 상태일 때만 리셋.
    // velocity.y >= 0 조건이 핵심 — 이륙 직후(velocity.y < 0)엔 잔여 접촉이 있어도
    // 리셋하지 않아 3단 점프 버그를 막는다.
    if (pb.blocked.down && pb.velocity.y >= 0) this.jumpsUsed = 0;

    for (const child of this.obstacles.getChildren()) {
      const r = child as Phaser.GameObjects.Rectangle;

      // 니어미스: 장애물이 플레이어 x를 막 통과한 순간 1회 평가
      if (!r.getData('scored') && r.x < this.player.x) {
        r.setData('scored', true);
        const obsTop = r.getData('topY') as number;
        const gap = obsTop - playerBottom; // 발끝이 윗면보다 위에 있을 때 양수
        if (airborne && gap >= 0 && gap <= NEAR_MISS_PX) {
          this.onNearMiss();
        } else if (airborne) {
          // 넉넉히 넘은 경우 콤보 리셋 (아슬아슬해야 콤보 유지)
          this.resetCombo();
        }
      }

      // 화면 밖으로 나간 장애물 제거
      if (r.x < -60) r.destroy();
    }
  }

  private onNearMiss() {
    this.nearMisses += 1;
    this.comboText.setText(`NEAR x${this.nearMisses}`);
    this.heal(NEAR_MISS_HEAL); // 아슬아슬 보상

    // 짜릿함: 화면 흔들림 + 플레이어 펄스 + 팝업
    this.cameras.main.shake(90, 0.006);

    this.player.setFillStyle(0xffffff);
    this.time.delayedCall(80, () => {
      if (!this.dead) this.player.setFillStyle(0x64ffda);
    });

    this.popupText(this.player.x, this.player.y - 50, `NICE! +${NEAR_MISS_HEAL}HP`, '#ffd166');
  }

  // 위로 떠오르며 사라지는 텍스트 팝업 (니어미스/포션 공용)
  private popupText(x: number, y: number, msg: string, color: string) {
    const pop = this.add
      .text(x, y, msg, { fontSize: '22px', color, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.tweens.add({
      targets: pop,
      y: y - 36,
      alpha: 0,
      duration: 520,
      ease: 'Cubic.out',
      onComplete: () => pop.destroy(),
    });
  }

  private renderHpBar() {
    const ratio = this.hp / HP_MAX;
    this.hpFill.scaleX = ratio;
    // 체력 구간별 색상: 초록 → 노랑 → 빨강
    this.hpFill.setFillStyle(ratio > 0.5 ? 0x2ecc71 : ratio > 0.25 ? 0xf1c40f : 0xff4757);
  }

  private resetCombo() {
    if (this.nearMisses > 0) {
      this.nearMisses = 0;
      this.comboText.setText('');
    }
  }

  private gameOver() {
    if (this.dead) return;
    this.dead = true;

    const pb = this.player.body as Phaser.Physics.Arcade.Body;
    pb.setVelocity(0, 0);
    pb.setGravityY(0);
    // 피격 깜빡임 트윈이 돌고 있을 수 있으니 정리 후 표시
    this.tweens.killTweensOf(this.player);
    this.player.setAlpha(1);
    this.player.setFillStyle(0xff4757);

    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height * 0.42;

    // 반투명 배경
    const bg = this.add.rectangle(cx, cy, 300, 190, 0x000000, 0.7).setOrigin(0.5);
    const title = this.add
      .text(cx, cy - 62, 'GAME OVER', { fontSize: '30px', color: '#ff4757', fontStyle: 'bold' })
      .setOrigin(0.5);
    const distLabel = this.add
      .text(cx, cy - 18, `거리  ${Math.floor(this.distance)}M`, { fontSize: '22px', color: '#ffffff' })
      .setOrigin(0.5);
    const nearLabel = this.add
      .text(cx, cy + 16, `아슬아슬  x${this.nearMisses}`, { fontSize: '18px', color: '#ffd166' })
      .setOrigin(0.5);
    const hint = this.add
      .text(cx, cy + 56, '탭하여 재시작', { fontSize: '16px', color: '#aaaaaa' })
      .setOrigin(0.5);

    this.gameOverGroup.addMultiple([bg, title, distLabel, nearLabel, hint]);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#1a1a2e',
  scene: GameScene,
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});
