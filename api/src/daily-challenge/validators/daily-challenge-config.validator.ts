import { Injectable } from '@nestjs/common';

import {
  DailyChallengeConfigValidationIssue,
  DailyChallengeTaskDefinition,
} from '../types/daily-challenge-config.types';
import {
  ChallengeMetric,
  ChallengeScope,
  ChallengeUnit,
  DAILY_CHALLENGE_MATCH_DATA_VERSION,
  DAILY_CHALLENGE_METRIC_MAX_MATCH_CONTRIBUTION,
  DAILY_CHALLENGE_METRIC_MIN_DATA_VERSION,
  DAILY_CHALLENGE_METRIC_UNIT,
} from '../types/daily-challenge.types';

type RuntimeRecord = Record<string, unknown>;

@Injectable()
export class DailyChallengeConfigValidator {
  validate(config: unknown): DailyChallengeConfigValidationIssue[] {
    const issues: DailyChallengeConfigValidationIssue[] = [];

    if (!this.isRecord(config)) {
      return [this.error('invalid_config', '每日挑战配置必须是对象')];
    }

    if (!this.isNonEmptyString(config.id)) {
      issues.push(this.error('invalid_config_id', '配置 ID 必须是非空字符串'));
    }
    if (!this.isPositiveInteger(config.version)) {
      issues.push(this.error('invalid_config_version', '配置版本必须是正整数'));
    }

    const tasks = config.tasks;
    const globalTargetPolicies = config.globalTargetPolicies;
    if (!Array.isArray(tasks)) {
      issues.push(this.error('invalid_tasks', '任务列表必须是数组'));
    } else {
      const seenTaskIds = new Set<string>();

      for (const rawTask of tasks) {
        if (!this.isRecord(rawTask)) {
          issues.push(this.error('invalid_task_shape', '任务定义必须是对象'));
          continue;
        }

        const taskId = this.getTaskId(rawTask);
        if (!taskId) {
          issues.push(this.error('invalid_task_id', '任务 ID 必须是非空字符串'));
        } else {
          if (seenTaskIds.has(taskId)) {
            issues.push(this.error('duplicate_task_id', '任务 ID 不能重复', taskId));
          }
          seenTaskIds.add(taskId);
        }

        this.validateTask(rawTask, globalTargetPolicies, issues);
      }

      this.validateCandidatePool(tasks, issues);
      this.validateAvailabilityWindows(tasks, issues);
    }

    if (!this.isRecord(globalTargetPolicies)) {
      issues.push(this.error('invalid_global_target_policies', '共同任务目标策略必须是对象'));
    }

    if (!this.isRecord(config.globalRewardTiers)) {
      issues.push(this.error('invalid_global_reward_tiers', '共同任务奖励档位必须是对象'));
    } else {
      this.validateGlobalRewardTiers(config.globalRewardTiers, issues);
    }

    this.validateOptionalPersonalRounds(config.personalRoundsPerDay, issues);
    this.validateOptionalStarMap(
      config.personalStarRewards,
      'invalid_personal_star_rewards',
      '个人任务星级奖励必须完整包含 1/2/3 星正整数',
      issues,
      (value) => this.isPositiveInteger(value),
    );
    this.validateOptionalStarMapOrder(
      config.personalStarRewards,
      'invalid_personal_star_reward_order',
      '个人任务星级奖励必须满足 1 星不高于 2 星、2 星不高于 3 星',
      issues,
    );
    this.validateOptionalStarMap(
      config.personalStarWeights,
      'invalid_personal_star_weights',
      '个人任务星级权重必须完整包含 1/2/3 星非负数，且总和大于 0',
      issues,
      (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0,
      true,
    );
    this.validateOptionalStarMap(
      config.personalDefaultStarMultipliers,
      'invalid_personal_star_multipliers',
      '个人任务默认星级倍率必须完整包含 1/2/3 星大于 0 的数值',
      issues,
      (value) => typeof value === 'number' && Number.isFinite(value) && value > 0,
    );
    this.validateOptionalStarMapOrder(
      config.personalDefaultStarMultipliers,
      'invalid_personal_star_multiplier_order',
      '个人任务星级倍率必须满足 1 星不高于 2 星、2 星不高于 3 星',
      issues,
    );

    if (!Array.isArray(config.refreshCostsMemberPoint)) {
      issues.push(this.error('invalid_refresh_costs_shape', '刷新费用必须是数组'));
    } else {
      this.validateRefreshCosts(config.refreshCostsMemberPoint, issues);
    }

    if (!Array.isArray(config.streakMilestones)) {
      issues.push(this.error('invalid_streak_milestones_shape', '连续奖励里程碑必须是数组'));
    } else {
      this.validateStreakMilestones(config.streakMilestones, issues);
    }

    return issues;
  }

  private validateTask(
    rawTask: RuntimeRecord,
    globalTargetPolicies: unknown,
    issues: DailyChallengeConfigValidationIssue[],
  ): void {
    const task = rawTask as unknown as DailyChallengeTaskDefinition;
    const taskId = this.getTaskId(rawTask);

    if (!Object.values(ChallengeScope).includes(task.scope)) {
      issues.push(this.error('unsupported_scope', '任务范围不受支持', taskId));
    }
    const metricIsSupported = Object.values(ChallengeMetric).includes(task.metric);
    if (!metricIsSupported) {
      issues.push(this.error('unsupported_metric', '任务指标不受支持', taskId));
    }
    const unitIsSupported = Object.values(ChallengeUnit).includes(task.unit);
    if (!unitIsSupported) {
      issues.push(this.error('unsupported_unit', '任务单位不受支持', taskId));
    }
    if (
      metricIsSupported &&
      unitIsSupported &&
      task.unit !== DAILY_CHALLENGE_METRIC_UNIT[task.metric]
    ) {
      issues.push(
        this.error(
          'invalid_metric_unit',
          `Metric ${task.metric} must use unit ${DAILY_CHALLENGE_METRIC_UNIT[task.metric]}`,
          taskId,
        ),
      );
    }

    this.requirePositiveInteger(
      task.revision,
      'invalid_revision',
      '任务修订号必须是正整数',
      taskId,
      issues,
    );
    this.requirePositiveInteger(
      task.target,
      'invalid_target',
      '任务目标必须是正整数',
      taskId,
      issues,
    );
    this.requirePositiveInteger(
      task.rewardSeasonPoint,
      'invalid_reward',
      '赛季积分奖励必须是正整数',
      taskId,
      issues,
    );
    this.validateTaskStarTargets(rawTask.starTargets, task.scope, taskId, issues);
    this.requirePositiveInteger(
      task.weight,
      'invalid_weight',
      '任务权重必须是正整数',
      taskId,
      issues,
    );
    this.requirePositiveInteger(
      task.expectedMatches,
      'invalid_expected_matches',
      '预计局数必须是正整数',
      taskId,
      issues,
    );
    this.requireNonNegativeInteger(
      task.cooldownDays,
      'invalid_cooldown',
      '冷却天数必须是非负整数',
      taskId,
      issues,
    );
    this.requirePositiveInteger(
      task.minDataVersion,
      'invalid_data_version',
      '数据版本必须是正整数',
      taskId,
      issues,
    );

    const metricMinDataVersion = DAILY_CHALLENGE_METRIC_MIN_DATA_VERSION[task.metric];
    if (
      metricMinDataVersion !== undefined &&
      this.isPositiveInteger(task.minDataVersion) &&
      task.minDataVersion < metricMinDataVersion
    ) {
      issues.push(
        this.error(
          'metric_data_version_too_low',
          `指标 ${task.metric} 要求数据版本至少为 ${metricMinDataVersion}`,
          taskId,
        ),
      );
    }

    const maxMatchContribution = DAILY_CHALLENGE_METRIC_MAX_MATCH_CONTRIBUTION[task.metric];
    if (
      task.scope !== ChallengeScope.GLOBAL &&
      maxMatchContribution !== undefined &&
      this.isPositiveInteger(task.target) &&
      this.isPositiveInteger(task.expectedMatches) &&
      task.target / task.expectedMatches > maxMatchContribution
    ) {
      issues.push(
        this.error(
          'target_exceeds_metric_limit',
          `Task target exceeds the reasonable ${task.metric} limit for expected matches`,
          taskId,
        ),
      );
    }

    this.validateLocalizedText(task.title, 'title', taskId, issues);
    this.validateLocalizedText(task.description, 'description', taskId, issues);

    if (task.scope === ChallengeScope.PERSONAL_HERO && !this.isNonEmptyString(task.heroName)) {
      issues.push(this.error('missing_hero', '英雄限定任务必须指定英雄', taskId));
    }
    if (task.scope !== ChallengeScope.PERSONAL_HERO && task.heroName) {
      issues.push(this.error('unexpected_hero', '非英雄限定任务不能指定英雄', taskId));
    }

    if (
      task.scope === ChallengeScope.PERSONAL_HERO &&
      task.metric === ChallengeMetric.PURE_DAMAGE
    ) {
      const evidence = task.pureDamageEvidence;
      if (
        !this.isRecord(evidence) ||
        evidence.heroName !== task.heroName ||
        !Array.isArray(evidence.abilityNames) ||
        evidence.abilityNames.length === 0 ||
        evidence.abilityNames.some((name) => !this.isNonEmptyString(name)) ||
        !this.isNonEmptyString(evidence.verifiedGameRevision) ||
        !this.isNonEmptyString(evidence.verifiedAt)
      ) {
        issues.push(
          this.error(
            'missing_pure_damage_evidence',
            '英雄纯粹伤害任务必须提供已验证的英雄技能证据',
            taskId,
          ),
        );
      }
    }

    if (task.scope === ChallengeScope.GLOBAL) {
      const policies = this.isRecord(globalTargetPolicies) ? globalTargetPolicies : undefined;
      const policy = taskId && policies ? policies[taskId] : undefined;
      if (policy === undefined) {
        issues.push(this.error('missing_global_target_policy', '共同任务必须配置目标策略', taskId));
      } else if (!this.isRecord(policy)) {
        issues.push(
          this.error('invalid_global_target_policy', '共同任务目标策略必须是对象', taskId),
        );
      } else {
        this.validateGlobalTargetPolicy(policy, task, taskId, issues);
      }
    }
  }

  private validateLocalizedText(
    text: unknown,
    field: string,
    taskId: string | undefined,
    issues: DailyChallengeConfigValidationIssue[],
  ): void {
    if (!this.isRecord(text)) {
      issues.push(
        this.error('invalid_localization', `${field} 必须包含 cn、en、ru 三种文本`, taskId),
      );
      return;
    }

    const values = [text.cn, text.en, text.ru];
    if (values.some((value) => typeof value !== 'string')) {
      issues.push(
        this.error('invalid_localization', `${field} 必须包含 cn、en、ru 三种文本`, taskId),
      );
      return;
    }

    const localizedValues = values as string[];
    if (localizedValues.some((value) => !value.trim())) {
      issues.push(
        this.error('missing_localization', `${field} 的 cn、en、ru 文本不能为空`, taskId),
      );
      return;
    }

    const placeholders = localizedValues.map((value) => this.extractPlaceholders(value));
    if (placeholders.some((value) => value !== placeholders[0])) {
      issues.push(this.error('placeholder_mismatch', `${field} 的三语占位符必须一致`, taskId));
    }
  }

  private extractPlaceholders(value: string): string {
    return [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)]
      .map((match) => match[1])
      .sort()
      .join('|');
  }

  private validateAvailabilityWindows(
    tasks: unknown[],
    issues: DailyChallengeConfigValidationIssue[],
  ): void {
    const enabledTasks = tasks.filter(
      (task): task is RuntimeRecord =>
        this.isRecord(task) && task.enabled === true && this.isSupportedByCurrentDataVersion(task),
    );
    const boundaryDates = new Set<string>();
    let hasAvailabilityWindow = false;

    for (const task of enabledTasks) {
      const taskId = this.getTaskId(task);
      const availableFrom = task.availableFrom;
      const availableUntil = task.availableUntil;
      const hasFrom = availableFrom !== undefined;
      const hasUntil = availableUntil !== undefined;
      if (!hasFrom && !hasUntil) {
        continue;
      }
      hasAvailabilityWindow = true;

      if (hasFrom && !this.isDayId(availableFrom)) {
        issues.push(
          this.error('invalid_availability_window', '可用日期必须使用 YYYY-MM-DD', taskId),
        );
      } else if (this.isDayId(availableFrom)) {
        boundaryDates.add(availableFrom);
      }
      if (hasUntil && !this.isDayId(availableUntil)) {
        issues.push(
          this.error('invalid_availability_window', '可用日期必须使用 YYYY-MM-DD', taskId),
        );
      } else if (this.isDayId(availableUntil)) {
        boundaryDates.add(availableUntil);
        boundaryDates.add(this.addDays(availableUntil, 1));
      }
      if (
        this.isDayId(availableFrom) &&
        this.isDayId(availableUntil) &&
        availableFrom > availableUntil
      ) {
        issues.push(
          this.error('invalid_availability_window', '可用开始日期不能晚于结束日期', taskId),
        );
      }
    }

    if (!hasAvailabilityWindow || boundaryDates.size === 0) {
      return;
    }

    const sortedBoundaryDates = [...boundaryDates].sort();
    const sampleDates = new Set(sortedBoundaryDates);
    const firstDate = sortedBoundaryDates[0];
    const lastDate = sortedBoundaryDates[sortedBoundaryDates.length - 1];
    sampleDates.add(this.addDays(firstDate, -1));
    sampleDates.add(this.addDays(lastDate, 1));

    for (const dayId of sampleDates) {
      const available = enabledTasks.filter((task) => this.isTaskAvailableOn(task, dayId));
      const generalCategories = new Set(
        available
          .filter((task) => task.scope === ChallengeScope.PERSONAL_GENERAL)
          .map((task) => task.category),
      );
      const hasHero = available.some((task) => task.scope === ChallengeScope.PERSONAL_HERO);
      const hasGlobal = available.some((task) => task.scope === ChallengeScope.GLOBAL);
      if (generalCategories.size < 2 || !hasHero || !hasGlobal) {
        issues.push(
          this.error(
            'insufficient_task_pool_capacity',
            `日期 ${dayId} 的可用任务不足以生成两个通用分类、一个英雄任务和一个共同任务`,
          ),
        );
        return;
      }
    }
  }

  private isTaskAvailableOn(task: RuntimeRecord, dayId: string): boolean {
    return (
      task.enabled === true &&
      this.isSupportedByCurrentDataVersion(task) &&
      (!task.availableFrom || task.availableFrom <= dayId) &&
      (!task.availableUntil || task.availableUntil >= dayId)
    );
  }

  private isSupportedByCurrentDataVersion(task: RuntimeRecord): boolean {
    return (
      this.isPositiveInteger(task.minDataVersion) &&
      task.minDataVersion <= DAILY_CHALLENGE_MATCH_DATA_VERSION
    );
  }

  private isDayId(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  private addDays(dayId: string, amount: number): string {
    const date = new Date(`${dayId}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  }

  private validateCandidatePool(
    tasks: unknown[],
    issues: DailyChallengeConfigValidationIssue[],
  ): void {
    const enabled = tasks.filter(
      (task): task is RuntimeRecord =>
        this.isRecord(task) && task.enabled === true && this.isSupportedByCurrentDataVersion(task),
    );
    const generalCategories = new Set(
      enabled
        .filter((task) => task.scope === ChallengeScope.PERSONAL_GENERAL)
        .map((task) => task.category),
    );
    if (generalCategories.size < 2) {
      issues.push(
        this.error('insufficient_general_categories', '当前协议至少需要两个通用任务分类'),
      );
    }
    if (!enabled.some((task) => task.scope === ChallengeScope.PERSONAL_HERO)) {
      issues.push(this.error('insufficient_hero_tasks', '当前协议至少需要一个英雄限定任务'));
    }
    if (!enabled.some((task) => task.scope === ChallengeScope.GLOBAL)) {
      issues.push(this.error('insufficient_global_tasks', '当前协议至少需要一个共同任务'));
    }
  }

  private validateGlobalTargetPolicy(
    policy: RuntimeRecord,
    task: DailyChallengeTaskDefinition,
    taskId: string | undefined,
    issues: DailyChallengeConfigValidationIssue[],
  ): void {
    const positiveFields: Array<[unknown, string, string]> = [
      [policy.launchTarget, 'invalid_launch_target', '初始目标必须是正整数'],
      [policy.minTarget, 'invalid_min_target', '最低目标必须是正整数'],
      [policy.maxTarget, 'invalid_max_target', '最高目标必须是正整数'],
      [
        policy.perPlayerExpectedContribution,
        'invalid_expected_contribution',
        '人均预期贡献必须是正整数',
      ],
    ];
    for (const [value, code, message] of positiveFields) {
      this.requirePositiveInteger(value, code, message, taskId, issues);
    }

    const minTarget = policy.minTarget;
    const launchTarget = policy.launchTarget;
    const maxTarget = policy.maxTarget;
    if (
      this.isPositiveInteger(minTarget) &&
      this.isPositiveInteger(launchTarget) &&
      this.isPositiveInteger(maxTarget) &&
      (minTarget > launchTarget || launchTarget > maxTarget)
    ) {
      issues.push(
        this.error(
          'invalid_target_bounds',
          '目标范围必须满足 最低目标 <= 初始目标 <= 最高目标',
          taskId,
        ),
      );
    }

    if (
      this.isPositiveInteger(task.target) &&
      this.isPositiveInteger(minTarget) &&
      this.isPositiveInteger(maxTarget) &&
      (task.target < minTarget || task.target > maxTarget)
    ) {
      issues.push(
        this.error(
          'global_task_target_out_of_bounds',
          'Global task target must stay within its policy bounds',
          taskId,
        ),
      );
    }

    const maxMatchContribution = DAILY_CHALLENGE_METRIC_MAX_MATCH_CONTRIBUTION[task.metric];
    if (
      maxMatchContribution !== undefined &&
      this.isPositiveInteger(policy.perPlayerExpectedContribution) &&
      this.isPositiveInteger(task.expectedMatches) &&
      policy.perPlayerExpectedContribution / task.expectedMatches > maxMatchContribution
    ) {
      issues.push(
        this.error(
          'expected_contribution_exceeds_metric_limit',
          `Expected player contribution exceeds the reasonable ${task.metric} limit`,
          taskId,
        ),
      );
    }

    const completionFactor = policy.completionFactor;
    if (
      typeof completionFactor !== 'number' ||
      !Number.isFinite(completionFactor) ||
      completionFactor <= 0
    ) {
      issues.push(this.error('invalid_completion_factor', '完成系数必须大于 0', taskId));
    }

    const maxDailyChangeRatio = policy.maxDailyChangeRatio;
    if (
      typeof maxDailyChangeRatio !== 'number' ||
      !Number.isFinite(maxDailyChangeRatio) ||
      maxDailyChangeRatio < 0.2 ||
      maxDailyChangeRatio > 0.3
    ) {
      issues.push(
        this.error('invalid_daily_change_ratio', '每日目标调整比例必须在 20% 到 30% 之间', taskId),
      );
    }
  }

  private validateGlobalRewardTiers(
    tiers: RuntimeRecord,
    issues: DailyChallengeConfigValidationIssue[],
  ): void {
    const topPercent = tiers.topPercent;
    const middlePercent = tiers.middlePercent;
    const sharesAreIntegers =
      this.isPositiveInteger(topPercent) && this.isPositiveInteger(middlePercent);
    if (!sharesAreIntegers || (sharesAreIntegers && topPercent + middlePercent >= 100)) {
      issues.push(
        this.error(
          'invalid_global_reward_tier_shares',
          '最高档和中间档占比必须是正整数，且合计小于 100%',
        ),
      );
    }

    const topRewardSeasonPoint = tiers.topRewardSeasonPoint;
    const middleRewardSeasonPoint = tiers.middleRewardSeasonPoint;
    const baseRewardSeasonPoint = tiers.baseRewardSeasonPoint;
    const rewardsArePositive =
      this.isPositiveInteger(topRewardSeasonPoint) &&
      this.isPositiveInteger(middleRewardSeasonPoint) &&
      this.isPositiveInteger(baseRewardSeasonPoint);
    if (
      !rewardsArePositive ||
      (rewardsArePositive &&
        (topRewardSeasonPoint < middleRewardSeasonPoint ||
          middleRewardSeasonPoint < baseRewardSeasonPoint))
    ) {
      issues.push(
        this.error(
          'invalid_global_reward_tier_rewards',
          '档位赛季积分必须是正整数，且最高档不少于中间档、中间档不少于基础档',
        ),
      );
    }
  }

  private validateOptionalPersonalRounds(
    value: unknown,
    issues: DailyChallengeConfigValidationIssue[],
  ): void {
    if (value === undefined) {
      return;
    }
    if (!this.isPositiveInteger(value) || value > 10) {
      issues.push(this.error('invalid_personal_rounds', '个人任务每日轮数必须是 1 到 10 的整数'));
    }
  }

  private validateOptionalStarMap(
    value: unknown,
    code: string,
    message: string,
    issues: DailyChallengeConfigValidationIssue[],
    validateValue: (entry: unknown) => boolean,
    requirePositiveSum = false,
  ): void {
    if (value === undefined) {
      return;
    }
    if (!this.isRecord(value)) {
      issues.push(this.error(code, message));
      return;
    }
    const entries = [value['1'], value['2'], value['3']];
    const exactKeys = Object.keys(value).sort().join(',') === '1,2,3';
    const positiveSum =
      !requirePositiveSum ||
      entries.reduce<number>((sum, entry) => sum + (typeof entry === 'number' ? entry : 0), 0) > 0;
    if (!exactKeys || entries.some((entry) => !validateValue(entry)) || !positiveSum) {
      issues.push(this.error(code, message));
    }
  }

  private validateOptionalStarMapOrder(
    value: unknown,
    code: string,
    message: string,
    issues: DailyChallengeConfigValidationIssue[],
    taskId?: string,
  ): void {
    if (!this.isRecord(value)) {
      return;
    }
    const entries = [value['1'], value['2'], value['3']];
    if (
      entries.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry)) ||
      (entries[0] as number) > (entries[1] as number) ||
      (entries[1] as number) > (entries[2] as number)
    ) {
      issues.push(this.error(code, message, taskId));
    }
  }

  private validateTaskStarTargets(
    value: unknown,
    scope: ChallengeScope,
    taskId: string | undefined,
    issues: DailyChallengeConfigValidationIssue[],
  ): void {
    if (value === undefined) {
      return;
    }
    if (scope === ChallengeScope.GLOBAL) {
      issues.push(
        this.error('global_star_targets_not_allowed', '共同任务不能配置个人任务星级目标', taskId),
      );
      return;
    }
    const before = issues.length;
    this.validateOptionalStarMap(
      value,
      'invalid_task_star_targets',
      '任务星级目标必须完整包含 1/2/3 星正整数',
      issues,
      (entry) => this.isPositiveInteger(entry),
    );
    if (issues.length > before && taskId) {
      issues[issues.length - 1].taskId = taskId;
    }
    this.validateOptionalStarMapOrder(
      value,
      'invalid_task_star_target_order',
      '任务星级目标必须满足 1 星不高于 2 星、2 星不高于 3 星',
      issues,
      taskId,
    );
  }

  private validateRefreshCosts(
    costs: unknown[],
    issues: DailyChallengeConfigValidationIssue[],
  ): void {
    if (costs.length !== 5 || costs.some((cost) => !this.isPositiveInteger(cost))) {
      issues.push(
        this.error(
          'invalid_refresh_costs',
          '付费刷新费用必须恰好包含 5 个正整数；免费刷新单独记录',
        ),
      );
    }
  }

  private validateStreakMilestones(
    milestones: unknown[],
    issues: DailyChallengeConfigValidationIssue[],
  ): void {
    if (milestones.length === 0) {
      issues.push(this.error('invalid_streak_milestones', '连续奖励里程碑不能为空'));
      return;
    }

    let previousDays = 0;
    for (const milestone of milestones) {
      if (
        !this.isRecord(milestone) ||
        !this.isPositiveInteger(milestone.days) ||
        milestone.days <= previousDays ||
        !this.isPositiveInteger(milestone.rewardSeasonPoint)
      ) {
        issues.push(
          this.error(
            'invalid_streak_milestones',
            '连续奖励里程碑天数必须递增，天数和奖励必须是正整数',
          ),
        );
        return;
      }
      previousDays = milestone.days;
    }
  }

  private requirePositiveInteger(
    value: unknown,
    code: string,
    message: string,
    taskId: string | undefined,
    issues: DailyChallengeConfigValidationIssue[],
  ): void {
    if (!this.isPositiveInteger(value)) {
      issues.push(this.error(code, message, taskId));
    }
  }

  private requireNonNegativeInteger(
    value: unknown,
    code: string,
    message: string,
    taskId: string | undefined,
    issues: DailyChallengeConfigValidationIssue[],
  ): void {
    if (!this.isNonNegativeInteger(value)) {
      issues.push(this.error(code, message, taskId));
    }
  }

  private getTaskId(task: RuntimeRecord): string | undefined {
    return this.isNonEmptyString(task.id) ? task.id : undefined;
  }

  private isRecord(value: unknown): value is RuntimeRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
  }

  private isNonNegativeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
  }

  private error(
    code: string,
    message: string,
    taskId?: string,
  ): DailyChallengeConfigValidationIssue {
    return { severity: 'error', code, message, taskId };
  }
}
