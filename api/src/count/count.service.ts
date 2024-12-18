import { Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { GameEndDto } from '../game/dto/game-end.request.body';

import { HeroWinrate } from './dto/hero-winrate.entity';
import { CountDifficult } from './entities/count-difficult.entity';
import { CountHero, HeroType } from './entities/count-hero.entity';
import { CountMatch } from './entities/count-match.entity';

@Injectable()
export class CountService {
  constructor(
    @InjectRepository(CountMatch)
    private readonly countMatchRepository: BaseFirestoreRepository<CountMatch>,
    @InjectRepository(CountDifficult)
    private readonly countDifficultRepository: BaseFirestoreRepository<CountDifficult>,
    @InjectRepository(CountHero)
    private readonly countHeroRepository: BaseFirestoreRepository<CountHero>,
  ) {}

  findAllMatch() {
    return this.countMatchRepository.find();
  }

  async findHeroRate(version: string, heroType: string, order?: string) {
    let totalCount = 0;
    const heroWinrateMap: Map<string, HeroWinrate> = new Map();
    for (const heroName of this.heroNameList) {
      const heroWinrate = new HeroWinrate(heroName);
      const countHeroList = await this.countHeroRepository
        .whereEqualTo('version', version)
        .whereEqualTo('isHuman', heroType == HeroType.human)
        .whereEqualTo('heroName', heroName)
        .find();
      for (const countHero of countHeroList) {
        totalCount += countHero.total;
        heroWinrate.win += countHero.win;
        heroWinrate.total += countHero.total;
      }
      heroWinrateMap.set(heroName, heroWinrate);
    }
    const heroRate = Array.from(heroWinrateMap.values()).map((heroWinrate) => {
      heroWinrate.winrate = heroWinrate.win / heroWinrate.total || 0;
      heroWinrate.pickrate = heroWinrate.total / totalCount || 0;
      return heroWinrate;
    });
    return heroRate.sort((a, b) => {
      if (order == 'winrate') {
        return b.winrate - a.winrate;
      } else if (order == 'pickrate') {
        return b.pickrate - a.pickrate;
      } else {
        return b.total - a.total;
      }
    });
  }

  async findHeroRateChart(version: string, heroType: string, order?: string) {
    const heroRate = await this.findHeroRate(version, heroType, order);
    const label = heroRate.map((heroWinrate) => heroWinrate.heroName);
    const winrate = heroRate.map((heroWinrate) => heroWinrate.winrate * 100);
    const pickrate = heroRate.map((heroWinrate) => heroWinrate.pickrate * 100);
    return {
      label: `'${label.join("', '")}'`,
      winrate: winrate.join(', '),
      pickrate: pickrate.join(', '),
    };
  }

  findHeroPickrate() {
    return this.countMatchRepository.find();
  }

  async countGameDifficult(gameEnd: GameEndDto) {
    const id = `${gameEnd.version}#${gameEnd.gameOption.gameDifficulty}`;
    const existMatchDifficult = await this.countDifficultRepository.findById(id);
    if (existMatchDifficult) {
      existMatchDifficult.add(gameEnd);
      await this.countDifficultRepository.update(existMatchDifficult);
    } else {
      const matchCount = new CountDifficult();
      matchCount.init(id);
      matchCount.add(gameEnd);
      await this.countDifficultRepository.create(matchCount);
    }
  }

  async countHeroes(gameEnd: GameEndDto) {
    for (const player of gameEnd.players) {
      let heroType: HeroType;
      if (player.steamId != 0) {
        // 人类玩家
        heroType = HeroType.human;
      } else if (player.teamId == 3) {
        // 夜魇bot
        heroType = HeroType.bot;
      } else {
        // 天辉bot
        continue;
      }
      const id = `${gameEnd.version}#${gameEnd.gameOption.gameDifficulty}#${heroType}#${player.heroName}`;
      const exist = await this.countHeroRepository.findById(id);

      const countHero = exist ?? new CountHero().init(id);
      countHero.add(player, gameEnd.winnerTeamId);
      if (exist) {
        await this.countHeroRepository.update(countHero);
      } else {
        await this.countHeroRepository.create(countHero);
      }
    }
  }

  private getDateString() {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }

  private heroNameList = [
    'npc_dota_hero_abaddon',
    'npc_dota_hero_alchemist',
    'npc_dota_hero_ancient_apparition',
    'npc_dota_hero_antimage',
    'npc_dota_hero_arc_warden',
    'npc_dota_hero_axe',
    'npc_dota_hero_bane',
    'npc_dota_hero_batrider',
    'npc_dota_hero_beastmaster',
    'npc_dota_hero_bloodseeker',
    'npc_dota_hero_bounty_hunter',
    'npc_dota_hero_brewmaster',
    'npc_dota_hero_bristleback',
    'npc_dota_hero_broodmother',
    'npc_dota_hero_centaur',
    'npc_dota_hero_chaos_knight',
    'npc_dota_hero_chen',
    'npc_dota_hero_clinkz',
    'npc_dota_hero_rattletrap',
    'npc_dota_hero_crystal_maiden',
    'npc_dota_hero_dark_seer',
    'npc_dota_hero_dazzle',
    'npc_dota_hero_dark_willow',
    'npc_dota_hero_death_prophet',
    'npc_dota_hero_disruptor',
    'npc_dota_hero_doom_bringer',
    'npc_dota_hero_dragon_knight',
    'npc_dota_hero_drow_ranger',
    'npc_dota_hero_earth_spirit',
    'npc_dota_hero_earthshaker',
    'npc_dota_hero_elder_titan',
    'npc_dota_hero_ember_spirit',
    'npc_dota_hero_enchantress',
    'npc_dota_hero_enigma',
    'npc_dota_hero_faceless_void',
    'npc_dota_hero_grimstroke',
    'npc_dota_hero_gyrocopter',
    'npc_dota_hero_huskar',
    'npc_dota_hero_invoker',
    'npc_dota_hero_wisp',
    'npc_dota_hero_jakiro',
    'npc_dota_hero_juggernaut',
    'npc_dota_hero_keeper_of_the_light',
    'npc_dota_hero_kunkka',
    'npc_dota_hero_legion_commander',
    'npc_dota_hero_leshrac',
    'npc_dota_hero_lich',
    'npc_dota_hero_life_stealer',
    'npc_dota_hero_lina',
    'npc_dota_hero_lion',
    'npc_dota_hero_lone_druid',
    'npc_dota_hero_luna',
    'npc_dota_hero_lycan',
    'npc_dota_hero_magnataur',
    'npc_dota_hero_mars',
    'npc_dota_hero_medusa',
    'npc_dota_hero_meepo',
    'npc_dota_hero_mirana',
    'npc_dota_hero_morphling',
    'npc_dota_hero_monkey_king',
    'npc_dota_hero_naga_siren',
    'npc_dota_hero_furion',
    'npc_dota_hero_necrolyte',
    'npc_dota_hero_night_stalker',
    'npc_dota_hero_nyx_assassin',
    'npc_dota_hero_ogre_magi',
    'npc_dota_hero_omniknight',
    'npc_dota_hero_oracle',
    'npc_dota_hero_obsidian_destroyer',
    'npc_dota_hero_pangolier',
    'npc_dota_hero_phantom_assassin',
    'npc_dota_hero_phantom_lancer',
    'npc_dota_hero_phoenix',
    'npc_dota_hero_puck',
    'npc_dota_hero_pudge',
    'npc_dota_hero_pugna',
    'npc_dota_hero_queenofpain',
    'npc_dota_hero_razor',
    'npc_dota_hero_riki',
    'npc_dota_hero_rubick',
    'npc_dota_hero_sand_king',
    'npc_dota_hero_shadow_demon',
    'npc_dota_hero_nevermore',
    'npc_dota_hero_shadow_shaman',
    'npc_dota_hero_silencer',
    'npc_dota_hero_skywrath_mage',
    'npc_dota_hero_slardar',
    'npc_dota_hero_slark',
    'npc_dota_hero_snapfire',
    'npc_dota_hero_sniper',
    'npc_dota_hero_spectre',
    'npc_dota_hero_spirit_breaker',
    'npc_dota_hero_storm_spirit',
    'npc_dota_hero_sven',
    'npc_dota_hero_techies',
    'npc_dota_hero_templar_assassin',
    'npc_dota_hero_terrorblade',
    'npc_dota_hero_tidehunter',
    'npc_dota_hero_shredder',
    'npc_dota_hero_tinker',
    'npc_dota_hero_tiny',
    'npc_dota_hero_treant',
    'npc_dota_hero_troll_warlord',
    'npc_dota_hero_tusk',
    'npc_dota_hero_abyssal_underlord',
    'npc_dota_hero_undying',
    'npc_dota_hero_ursa',
    'npc_dota_hero_vengefulspirit',
    'npc_dota_hero_venomancer',
    'npc_dota_hero_viper',
    'npc_dota_hero_visage',
    'npc_dota_hero_void_spirit',
    'npc_dota_hero_warlock',
    'npc_dota_hero_weaver',
    'npc_dota_hero_windrunner',
    'npc_dota_hero_winter_wyvern',
    'npc_dota_hero_witch_doctor',
    'npc_dota_hero_skeleton_king',
    'npc_dota_hero_zuus',
    'npc_dota_hero_hoodwink',
    'npc_dota_hero_dawnbreaker',
    'npc_dota_hero_marci',
    'npc_dota_hero_primal_beast',
    'npc_dota_hero_muerta',
    'npc_dota_hero_ringmaster',
  ];
}
