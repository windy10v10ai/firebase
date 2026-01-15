# AI Hero Recommendation System - Architecture and Implementation Plan

## Summary

This PR introduces the complete architecture and implementation plan for an AI-powered hero recommendation system for the Dota2 custom game. The system aims to improve Dire (bot team) win rate from ~20% to 25%+ by using machine learning to recommend optimal hero compositions.

### Key Features
- **ML-based hero recommendations**: XGBoost model trained on historical match data
- **BigQuery data infrastructure**: Unified table approach for all match data (historical + new)
- **FastAPI inference service**: High-performance API deployed on Cloud Run
- **Phased implementation**: 61 hours across 2 phases with 17 detailed GitHub issues

### Game Rules Confirmed
- Radiant (player side): 1-10 players (variable count), heroes can repeat
- Dire (bot side): fixed 10 heroes, no repeats
- Selection order: Radiant picks first, then Dire responds
- Current Dire win rate: ~20%, target: 25%+

### Architecture Highlights
- **Feature Engineering**: 260-dimensional input (130 Radiant count vector + 130 Dire multi-hot)
- **Training Strategy**: Generate 10 samples per match (one per Dire pick), weighted by win/loss
- **Data Source**: Single unified `dota2.matches` BigQuery table (partitioned by date, clustered by winner/difficulty)
- **Backend Integration**: NestJS writes to both GA4 (analytics) and BigQuery (ML training)

### Documentation Structure
- `ARCHITECTURE.md`: System design and technical decisions (v1.0)
- `BIGQUERY_SETUP.md`: Complete guide for table creation and data import
- `IMPLEMENTATION_PLAN_V2.md`: 17 detailed issues across 2 phases (61h total)
- `GITHUB_ISSUES.md`: Ready-to-use GitHub issue templates
- `README.md`: Documentation index and quick start

### Major Changes from Initial Plan
- **Unified data approach**: Build dedicated BigQuery table first, import ALL historical GA4 data into it (vs original two-phase GA4→dedicated table approach)
- **Reduced complexity**: Single `MatchDataLoader` class instead of dual data sources
- **Time savings**: 84h → 61h total implementation time (23h savings from simplified data infrastructure)

### Commits in this PR
1. `457ba42` - Initial architecture and implementation plan
2. `39bf848` - GitHub issues template generation
3. `8997016` - Updates with confirmed game rules and phased approach
4. `2e67e0a` - Restructure to prioritize dedicated BigQuery table
5. `63a7dad` - Clean up contradictions and consolidate to unified approach

## Test Plan

### Documentation Review
- [ ] Review `docs/ai-recommendation/README.md` for clarity and completeness
- [ ] Verify `ARCHITECTURE.md` accurately describes the unified table approach
- [ ] Check `BIGQUERY_SETUP.md` SQL queries are valid and complete
- [ ] Confirm `IMPLEMENTATION_PLAN_V2.md` has all 17 issues with correct time estimates
- [ ] Validate `GITHUB_ISSUES.md` templates are ready for GitHub issue creation

### Architecture Validation
- [ ] Verify BigQuery table schema matches game data structure (10 Radiant + 10 Dire heroes)
- [ ] Confirm feature engineering approach (260-dim vector) aligns with model requirements
- [ ] Check NestJS integration points for BigQuery writes
- [ ] Validate Cloud Run deployment strategy for FastAPI service

### Implementation Readiness
- [ ] Verify Issue #P1-0 (BigQuery table creation) is clearly defined as blocking task
- [ ] Confirm all Phase 1 dependencies are correctly sequenced
- [ ] Check that config examples (config.yaml) use correct parameters
- [ ] Validate code snippets in documentation are syntactically correct

### Consistency Check
- [ ] No references to obsolete `GA4MatchDataLoader` class
- [ ] No mentions of separate GA4 vs dedicated table phases
- [ ] All time estimates are updated (61h total)
- [ ] All code examples use unified `MatchDataLoader`
