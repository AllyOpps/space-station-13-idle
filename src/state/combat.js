import Vue from "vue";
import { createCoroutineModule } from "./coroutine";
import { acquireItemFrom } from "@/utils/itemChanceUtils";
import ENEMIES from "@/data/enemies";
import ITEMS from "@/data/items";

const combat = {
	namespaced: true,
	modules: {
		moveCoroutine: createCoroutineModule(),
		foodCoroutine: createCoroutineModule(),
		regenCoroutine: createCoroutineModule()
	},
	state: {
		targetEnemy: null,
		focus: "precision",
		drops: []
	},
	getters: {
		targetEnemy(state) {
			return state.targetEnemy;
		},
		maxDrops() {
			return 16;
		},
		regenTime(state, getters, rootState, rootGetters) {
			let baseRegenTime = 8;
			let ratio = 100 / rootGetters["playerMob/stats"].maxHealth;
			return baseRegenTime * ratio;
		},
		baseFoodCooldown() {
			return 2;
		},
		foodCooldown(state, getters) {
			return getters["baseFoodCooldown"];
		},
		drops(state) {
			return state.drops;
		},
		focus(state) {
			return state.focus;
		},
		isRanged(state, getters, rootState, rootGetters) {
			let handItemId = rootGetters["inventory/equipment"].hand.itemId;
			if (handItemId) {
				let handItem = ITEMS[handItemId];
				if (handItem.ammoType && !rootGetters["inventory/checkRestricted"](handItemId)) {
					return true;
				}
			}
			return false;
		}
	},
	mutations: {
		_setTargetEnemy(state, enemyId) {
			state.targetEnemy = enemyId;
		},
		removeLootItem(state, index) {
			state.drops.splice(index, 1);
		},
		addLootItem(state, { itemId, count }) {
			state.drops.push({ itemId, count });
		},
		clearLoot(state) {
			Vue.set(state, "drops", [])
		},
		setFocus(state, focus) {
			state.focus = focus;
		}
	},
	actions: {
		lootItem({ state, commit }, index) {
			let drop = state.drops[index];
			commit("inventory/changeItemCount", {
				itemId: drop.itemId,
				count: drop.count
			}, { root: true });
			commit("removeLootItem", index);
		},
		lootAll({ state, dispatch }) {
			while (state.drops.length) {
				dispatch("lootItem", 0);
			}
		},
		dropEnemyLoot({ state, commit }) {
			let enemy = ENEMIES[state.targetEnemy];
			let yieldedItems = acquireItemFrom(enemy);
			for (let [itemId, count] of Object.entries(yieldedItems)) {
				commit("addLootItem", { itemId, count });
			}
		},
		cancelActions({ state, commit, dispatch }) {
			dispatch("moveCoroutine/cancel");
			if (!state.targetEnemy) return;
			commit("_setTargetEnemy", null);
		},
		_resume({ state, dispatch, rootGetters }) {
			dispatch("_startRegen");
			if (!state.targetEnemy) return;

			if (rootGetters["enemyMob/health"] == 0) {
				dispatch("_startMove");
			}
		},
		startCombat({ dispatch, commit }, enemyId) {
			dispatch("cancelAllActions", {}, { root: true });
			commit("_setTargetEnemy", enemyId);
			commit("clearLoot");
			dispatch("playerMob/startCombat", {}, { root: true });
			dispatch("enemyMob/startCombat", {}, { root: true });
		},
		pauseCombat({ dispatch }) {
			dispatch("playerMob/pauseCombat", {}, { root: true });
			dispatch("enemyMob/pauseCombat", {}, { root: true });
			dispatch("_startMove");
		},
		continueCombat({ state, dispatch }) {
			if (!state.targetEnemy) return;
			dispatch("playerMob/startCombat", {}, { root: true });
			dispatch("enemyMob/startCombat", {}, { root: true });
		},
		_startMove({ dispatch, rootGetters }) {
			dispatch("moveCoroutine/start",
				{
					duration: rootGetters["playerMob/stats"].moveTime,
					onFinish: () => {
						dispatch("continueCombat");
					}
				});
		},
		_startRegen({ dispatch, getters }) {
			dispatch("regenCoroutine/start",
				{
					duration: getters["regenTime"],
					onFinish: () => {
						dispatch("_startRegen");
						dispatch("playerMob/addHealth", 1, { root: true });
					}
				});
		},
		addXP({ commit, getters, rootGetters }, damage) {
			let skill = getters.focus;
			if (skill == "power") {
				skill = getters.isRanged ? "meleePower" : "rangedPower";
			}
			commit(skill + "/addXP", damage, { root: true });
		},

		eat({ state, rootState, getters, rootGetters, dispatch }) {
			var food = rootState["inventory"].equipment.food;
			if (!food.itemId) return;
			if (rootGetters["playerMob/health"] >= rootGetters["playerMob/stats"].maxHealth) return;
			dispatch("playerMob/addHealth", ITEMS[food.itemId].healAmount, { root: true });

			if (food.count == 1) {
				food.count = 0;
				food.itemId = null;
			} else {
				food.count -= 1;
			}
			dispatch("_startFoodCD")
		},
		_startFoodCD({ dispatch, getters }) {
			dispatch("foodCoroutine/start",
				{
					duration: getters["foodCooldown"],
					onFinish: () => {
						//TODO maybe re-eat here
						// dispatch("playerMob/addHealth", 1, { root: true });
					}
				});
		},
	}
};

export default combat;