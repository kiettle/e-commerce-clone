export class LaneReporter {
  constructor(lane) {
    this.lane = lane;
  }

  onInit() {
    process.stdout.write(`[test lane: ${this.lane}]\n`);
  }
}
