import { Player } from '../entities/player.entity';

/**
 * PlayerLevelHelper - 纯计算函数，无状态
 * 负责玩家等级相关的所有计算逻辑
 */
export class PlayerLevelHelper {
  /**
   * 计算玩家总等级
   * @param player Player 对象或 null
   * @returns 总等级（赛季等级 + 会员等级）
   */
  static getPlayerTotalLevel(player: Player | null): number {
    if (!player) {
      return 0;
    }
    const seasonPoint = player.seasonPointTotal;
    const seasonLevel = this.getSeasonLevelBuyPoint(seasonPoint);
    const memberPoint = player.memberPointTotal;
    const memberLevel = this.getMemberLevelBuyPoint(memberPoint);
    return seasonLevel + memberLevel;
  }

  /**
   * 勇士积分 - 获取下一级所需积分
   * @param level 当前等级
   * @returns 升级积分
   */
  static getSeasonNextLevelPoint(level: number): number {
    return 100 * level;
  }

  /**
   * 勇士积分 - 指定等级所需累计积分
   * @param level 指定等级
   * @returns 累计积分
   */
  static getSeasonTotalPoint(level: number): number {
    return 50 * (level - 1) * level;
  }

  /**
   * 根据积分获取当前赛季等级
   * @param point 积分
   * @returns 当前等级
   */
  static getSeasonLevelBuyPoint(point: number): number {
    return Math.floor(Math.sqrt(point / 50 + 0.25) + 0.5);
  }

  /**
   * 会员积分 - 获取下一级所需积分
   * @param level 当前等级
   * @returns 升级积分
   */
  static getMemberNextLevelPoint(level: number): number {
    return 50 * (level + 19);
  }

  /**
   * 会员积分 - 指定等级所需累计积分
   * @param level 指定等级
   * @returns 累计积分
   */
  static getMemberTotalPoint(level: number): number {
    level -= 1;
    return 100 * ((level * level) / 4 + level * 9.75);
  }

  /**
   * 根据积分获取当前会员等级
   * @param point 积分
   * @returns 当前等级
   */
  static getMemberLevelBuyPoint(point: number): number {
    return Math.floor(Math.sqrt(point / 25 + 380.25) - 19.5) + 1;
  }
}
