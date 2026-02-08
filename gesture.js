import * as THREE from 'three';

export class GestureRecognizer {
    constructor(config) {
        this.config = config || {
            thumb_spawn: { duration: 600 },
            peace_record: { duration: 1000 },
            prayer_burst: { wrist_dist: 0.2, tip_dist: 0.2 },
            rapid_tap: { window: 1000, count: 5 }
        };

        this.state = {
            peaceSignDuration: 0,
            thumbUpDuration: 0,
            hitCount: 0,
            lastHitResetTime: 0
        };
    }

    reset() {
        this.state.peaceSignDuration = 0;
        this.state.thumbUpDuration = 0;
    }

    update(dt) {
        // Time-based updates if needed
        // For rapid tap, we check window on hit
        const now = performance.now();
        if (now - this.state.lastHitResetTime > this.config.rapid_tap.window) {
            this.state.hitCount = 0;
            this.state.lastHitResetTime = now;
        }
    }

    detectHands(landmarks) {
        const thumbExtended = landmarks[4].y < landmarks[3].y;
        const indexExtended = landmarks[8].y < landmarks[6].y;
        const middleExtended = landmarks[12].y < landmarks[10].y;
        const ringExtended = landmarks[16].y < landmarks[14].y;
        const pinkyExtended = landmarks[20].y < landmarks[18].y;

        let gesture = null;

        // Peace Sign
        if (indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
            this.state.peaceSignDuration += 16; // Approx 60fps frame time
            if (this.state.peaceSignDuration > this.config.peace_record.duration) {
                gesture = 'peace_record';
                this.state.peaceSignDuration = 0; // Reset after trigger? Or debounce?
            }
        } else {
            this.state.peaceSignDuration = 0;
        }

        // Thumbs Up
        if (thumbExtended && !indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
            this.state.thumbUpDuration += 16;
            if (this.state.thumbUpDuration > this.config.thumb_spawn.duration) {
                gesture = 'thumb_spawn';
                this.state.thumbUpDuration = 0;
            }
        } else {
            this.state.thumbUpDuration = 0;
        }

        return { gesture, progress: {
            peace: this.state.peaceSignDuration / this.config.peace_record.duration,
            thumb: this.state.thumbUpDuration / this.config.thumb_spawn.duration
        }};
    }

    detectPrayer(hand1, hand2) {
        const wrist1 = new THREE.Vector3(hand1[0].x, hand1[0].y, 0);
        const wrist2 = new THREE.Vector3(hand2[0].x, hand2[0].y, 0);
        const wristDist = wrist1.distanceTo(wrist2);

        const tip1 = new THREE.Vector3(hand1[8].x, hand1[8].y, 0);
        const tip2 = new THREE.Vector3(hand2[8].x, hand2[8].y, 0);
        const tipDist = tip1.distanceTo(tip2);

        if (wristDist < this.config.prayer_burst.wrist_dist && tipDist < this.config.prayer_burst.tip_dist) {
            return true;
        }
        return false;
    }

    registerHit() {
        const now = performance.now();
        if (now - this.state.lastHitResetTime > this.config.rapid_tap.window) {
            this.state.hitCount = 1;
            this.state.lastHitResetTime = now;
        } else {
            this.state.hitCount++;
        }

        if (this.state.hitCount >= this.config.rapid_tap.count) {
            this.state.hitCount = 0; // Reset
            return true; // Trigger Rapid Tap
        }
        return false;
    }
}