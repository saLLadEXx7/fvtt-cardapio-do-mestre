const MODULE_ID = "cardapio-do-capitao";
const SOCKET = `module.${MODULE_ID}`;
const CATALOG_KEY = "catalog";
const STOCK_KEY = "stock";
const CHEST_ACTOR_NAME = "Baú do Grupo";
const CHEST_CONTAINER_NAME = "Estoque do Cardápio";
const quantitySyncInProgress = new Set();
const EFFECT_DURATION_SECONDS = 600;

const DEFAULT_CATALOG = [
  {id:"espuma-kraken", number:1, name:"Espuma do Kraken", category:"Bebidas", price:"25 PO", description:"Beba para bravura!", effectText:"+1d4 no próximo teste de Constituição.", image:"modules/cardapio-do-capitao/assets/items/espuma-do-kraken.webp", quantity:1, duration:0, effects:[]},
  {id:"hidromel-mares", number:2, name:"Hidromel das Marés", category:"Bebidas", price:"50 PO", description:"Conecte-se com as ondas.", effectText:"Ganha 1 Inspiração.", image:"modules/cardapio-do-capitao/assets/items/hidromel-das-mares.webp", quantity:1, duration:0, effects:[]},
  {id:"licor-sereia", number:3, name:"Licor da Sereia", category:"Bebidas", price:"30 PO", description:"A graciosidade do oceano.", effectText:"+1d4 a um teste de Destreza.", image:"modules/cardapio-do-capitao/assets/items/licor-da-sereia.webp", quantity:1, duration:0, effects:[]},
  {id:"vinho-algas", number:4, name:"Vinho de Algas Douradas", category:"Bebidas", price:"75 PO", description:"Reacenda sua força.", effectText:"Recupera 1 slot de magia.", image:"modules/cardapio-do-capitao/assets/items/vinho-de-algas.webp", quantity:1, duration:0, effects:[]},
  {id:"carapaca-crocante", number:6, name:"Carapaça Crocante", category:"Comidas", price:"90 PO", description:"Tão resistente quanto aço.", effectText:"+1 na CA.", image:"modules/cardapio-do-capitao/assets/items/carapaca-crocante.webp", quantity:1, duration:0, effects:[]},
  {id:"ensopado-sete-mares", number:7, name:"Ensopado dos Sete Mares", category:"Comidas", price:"70 PO", description:"Força em cada colherada.", effectText:"+2 nos testes de ataque.", image:"modules/cardapio-do-capitao/assets/items/ensopado-sete-mares.webp", quantity:1, duration:0, effects:[]},
  {id:"peixe-farol", number:8, name:"Peixe do Farol", category:"Comidas", price:"35 PO", description:"Visão aguçada na névoa.", effectText:"Vantagem no próximo teste de Percepção.", image:"modules/cardapio-do-capitao/assets/items/peixe-do-farol.webp", quantity:1, duration:0, effects:[]},
  {id:"baiacu-flamejante", number:9, name:"Baiacu Flamejante", category:"Comidas", price:"65 PO", description:"O fogo das profundezas!", effectText:"Dano de fogo em Ação Bônus (1d4).", image:"modules/cardapio-do-capitao/assets/items/baiacu-flamejante.webp", quantity:1, duration:0, effects:[]}
];

const getSetting = key => game.settings.get(MODULE_ID, key);
const isGM = () => game.user?.isGM;

class CardapioApp extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "cardapio-do-capitao",
      title: "Cardápio do Capitão",
      template: `modules/${MODULE_ID}/templates/cardapio.html`,
      width: 900, height: 680, resizable: true,
      classes: ["cardapio-capitao"]
    });
  }

  getData() {
    const catalog = getSetting(CATALOG_KEY) ?? [];
    const stock = getSetting(STOCK_KEY) ?? [];
    return {
      catalog, stock, isGM: isGM(),
      categories: [...new Set(catalog.map(x => x.category || "Outros"))],
      actors: game.actors.filter(a => a.testUserPermission(game.user, "OWNER")).map(a => ({id:a.id, name:a.name}))
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-tab]").on("click", ev => {
      html.find("[data-tab]").removeClass("active");
      html.find(".tab-panel").hide();
      $(ev.currentTarget).addClass("active");
      html.find(`#${ev.currentTarget.dataset.tab}`).show();
    });
    html.find("[data-buy]").on("click", ev => this._requestAdd(ev.currentTarget.dataset.buy, 1));
    html.find("[data-open-chest]").on("click", async () => {
      const actor = game.actors.find(a => a.getFlag(MODULE_ID, "sharedChest"));
      if (actor && actor.testUserPermission(game.user, "OWNER")) actor.sheet.render(true);
      else ui.notifications.warn("O Baú do Grupo ainda não foi criado pelo mestre.");
    });
    html.find("[data-stock-add]").on("click", ev => this._requestStock(ev.currentTarget.dataset.stockAdd, 1));
    html.find("[data-stock-remove]").on("click", ev => this._requestStock(ev.currentTarget.dataset.stockRemove, -1));
    html.find("[data-consume]").on("click", ev => this._consume(ev.currentTarget.dataset.consume));
    html.find("[data-edit-catalog]").on("click", () => this._editCatalog());
    html.find("[data-drop-actor]").on("dragstart", ev => {
      const item = (getSetting(CATALOG_KEY) ?? []).find(x => x.id === ev.currentTarget.dataset.dropActor);
      if (!item) return;
      ev.originalEvent.dataTransfer.setData("text/plain", JSON.stringify({
        type:"Item", uuid:null, name:item.name, flags:{[MODULE_ID]:{foodId:item.id}}
      }));
    });
  }

  async _requestAdd(id, amount) {
    game.socket.emit(SOCKET, {action:"stock", id, delta:amount});
    ui.notifications.info("Solicitação enviada ao mestre para adicionar ao Baú do Grupo.");
  }

  async _requestStock(id, delta) {
    if (isGM()) return updateStock(id, delta);
    game.socket.emit(SOCKET, {action:"stock", id, delta});
    ui.notifications.info("Solicitação enviada ao mestre.");
  }

  async _consume(stockId) {
    const stock = getSetting(STOCK_KEY) ?? [];
    const entry = stock.find(x => x.stockId === stockId);
    if (!entry || entry.quantity < 1) return ui.notifications.warn("Este alimento não está disponível.");
    const owned = game.actors.filter(a => a.testUserPermission(game.user, "OWNER"));
    const actorOptions = Object.fromEntries(owned.map(a => [a.id, a.name]));
    const content = `<form><div class="form-group"><label>Personagem</label><select name="actor">${Object.entries(actorOptions).map(([id,n])=>`<option value="${id}">${foundry.utils.escapeHTML(n)}</option>`).join("")}</select></div></form>`;
    new Dialog({
      title:`Consumir ${entry.name}`,
      content,
      buttons:{consume:{label:"Consumir", callback: async html => {
        const actor = game.actors.get(html.find('[name="actor"]').val());
        if (!actor) return;
        await applyFood(actor, entry);
        game.socket.emit(SOCKET, {action:"stock", id:entry.id, delta:-1});
      }}, cancel:{label:"Cancelar"}},
      default:"consume"
    }).render(true);
  }

  async _editCatalog() {
    if (!isGM()) return;
    const current = JSON.stringify(getSetting(CATALOG_KEY) ?? [], null, 2);
    const content = `<p>Edite o catálogo em JSON. Cada efeito usa uma chave de atributo do D&D 5e, modo de alteração e valor.</p><textarea name="catalog" style="width:100%;height:380px;font-family:monospace">${foundry.utils.escapeHTML(current)}</textarea>`;
    new Dialog({title:"Editar catálogo", content, buttons:{save:{label:"Salvar", callback:async html=>{
      try {
        const data = JSON.parse(html.find('[name="catalog"]').val());
        if (!Array.isArray(data)) throw new Error("O catálogo precisa ser uma lista.");
        await game.settings.set(MODULE_ID, CATALOG_KEY, data);
        this.render();
      } catch(err) { ui.notifications.error(`JSON inválido: ${err.message}`); }
    }}, cancel:{label:"Cancelar"}}}).render(true);
  }
}

async function ensureSharedChest() {
  if (!game.user?.isGM) return game.actors.find(a => a.getFlag(MODULE_ID, "sharedChest")) ?? null;
  let actor = game.actors.find(a => a.getFlag(MODULE_ID, "sharedChest"));
  if (!actor) {
    actor = await Actor.create({
      name: CHEST_ACTOR_NAME,
      type: "npc",
      img: "icons/containers/chest/chest-reinforced-steel-brown.webp",
      ownership: { default: 3 },
      flags: { [MODULE_ID]: { sharedChest: true } }
    });
  }
  let container = actor.items.find(i => i.getFlag(MODULE_ID, "sharedContainer"));
  if (!container) {
    container = await actor.createEmbeddedDocuments("Item", [{
      name: CHEST_CONTAINER_NAME,
      type: "container",
      img: `modules/${MODULE_ID}/assets/estoque-do-cardapio.webp`,
      system: { quantity: 1, weight: 0, price: { value: 0, denomination: "gp" } },
      flags: { [MODULE_ID]: { sharedContainer: true } }
    }]).then(items => items[0]);
  }
  // Atualiza a imagem do Container mesmo quando ele já existia de uma versão anterior.
  const containerImage = `modules/${MODULE_ID}/assets/estoque-do-cardapio.webp`;
  if (container.img !== containerImage) {
    await container.update({ img: containerImage });
  }
  await syncChestItems(actor, container);
  return actor;
}

async function syncChestItems(actor, container) {
  const stock = getSetting(STOCK_KEY) ?? [];
  const existing = actor.items.filter(i => i.getFlag(MODULE_ID, "stockItem"));
  const wanted = new Set(stock.filter(x => x.quantity > 0).map(x => x.stockId));
  for (const item of existing) {
    if (!wanted.has(item.getFlag(MODULE_ID, "stockItem"))) await actor.deleteEmbeddedDocuments("Item", [item.id]);
  }
  for (const entry of stock.filter(x => x.quantity > 0)) {
    const current = actor.items.find(i => i.getFlag(MODULE_ID, "stockItem") === entry.stockId);
    const activityId = current
      ? (Object.keys(current.system.activities ?? {})[0] || foundry.utils.randomID())
      : foundry.utils.randomID();
    const quantity = Math.max(0, Number(entry.quantity) || 0);
    const activity = {
      _id: activityId,
      type: "utility",
      name: "Usar",
      activation: { type: "action", cost: 1, condition: "" },
      // itemUses é um tipo de consumo suportado pelo D&D5e 6.0.6.
      // O hook abaixo espelha os usos gastos na quantidade do inventário.
      consumption: {
        targets: [{ type: "itemUses", value: "1", target: null, scaling: { mode: "", formula: "" } }],
        scaling: { allowed: false, max: "" }
      },
      duration: { units: "inst", value: null, concentration: false },
      effects: [],
      range: { value: null, units: "self" },
      target: {
        affects: { count: "1", type: "self", choice: false },
        template: { contiguous: false, units: "", type: "", size: "", width: "", height: "" },
        prompt: false
      }
    };

    const safe = value => foundry.utils.escapeHTML(String(value ?? ""));
    const descriptionHtml = [
      entry.description ? `<p>${safe(entry.description)}</p>` : "",
      `<p><strong>Efeito:</strong> ${safe(entry.effectText || "Sem efeito informado.")}</p>`,
      `<p><strong>Preço:</strong> ${safe(entry.price || "")}</p>`
    ].filter(Boolean).join("");

    const itemData = {
      name: entry.name,
      type: "consumable",
      img: entry.image || "icons/consumables/food/bread-loaf-boule-rustic-brown.webp",
      system: {
        quantity,
        uses: { spent: 0, max: quantity, recovery: [] },
        description: { value: descriptionHtml },
        price: { value: 0, denomination: "gp" },
        weight: 0,
        consumableType: "food",
        activities: { [activityId]: activity }
      },
      flags: { [MODULE_ID]: { stockItem: entry.stockId, catalogId: entry.id, listedPrice: entry.price || "" } }
    };

    let item = current;
    if (current) {
      await current.update({
        name: itemData.name,
        type: "consumable",
        img: itemData.img,
        "system.quantity": quantity,
        "system.uses": itemData.system.uses,
        "system.description.value": descriptionHtml,
        "system.consumableType": "food",
        "system.activities": itemData.system.activities,
        "flags.cardapio-do-capitao.listedPrice": entry.price || ""
      });
    } else {
      itemData.system.container = container.id;
      [item] = await actor.createEmbeddedDocuments("Item", [itemData]);
    }

    const consumption = foundry.utils.deepClone(item.system.activities?.get?.(activityId)?.consumption
      ?? item.system.activities?.[activityId]?.consumption
      ?? activity.consumption);
    if (consumption?.targets?.[0]) {
      consumption.targets[0].target = item.uuid;
      await item.update({ [`system.activities.${activityId}.consumption`]: consumption });
    }
  }
}

// Mantém a quantidade visível sincronizada com os usos consumidos pela Activity.
Hooks.on("updateItem", async (item, changes) => {
  if (!item?.getFlag?.(MODULE_ID, "stockItem")) return;
  if (quantitySyncInProgress.has(item.uuid)) return;
  const spent = changes?.["system.uses.spent"] ?? foundry.utils.getProperty(changes, "system.uses.spent");
  if (spent === undefined) return;
  const used = Math.max(0, Number(item.system.uses?.spent) || 0);
  if (!used) return;

  const remaining = Math.max(0, Number(item.system.quantity || 0) - used);
  const actor = item.parent;
  const catalogId = item.getFlag(MODULE_ID, "catalogId");
  const food = (getSetting(CATALOG_KEY) ?? DEFAULT_CATALOG).find(entry => entry.id === catalogId);

  quantitySyncInProgress.add(item.uuid);
  try {
    await item.update({
      "system.quantity": remaining,
      "system.uses.spent": 0,
      "system.uses.max": remaining
    });
    if (actor && food) await applyFood(actor, food);
    if (remaining === 0) ui.notifications.info(`${item.name}: última unidade consumida.`);
  } catch (err) {
    console.error(`${MODULE_ID} | Falha ao sincronizar quantidade/aplicar efeito`, err);
    ui.notifications.error(`Não foi possível concluir o consumo de ${item.name}. Consulte o console.`);
  } finally {
    quantitySyncInProgress.delete(item.uuid);
  }
});

async function updateStock(id, delta) {
  const catalog = getSetting(CATALOG_KEY) ?? [];
  const product = catalog.find(x => x.id === id);
  if (!product) return;
  const stock = foundry.utils.deepClone(getSetting(STOCK_KEY) ?? []);
  let entry = stock.find(x => x.id === id);
  if (!entry && delta > 0) {
    entry = {...foundry.utils.deepClone(product), stockId:foundry.utils.randomID(), quantity:0};
    stock.push(entry);
  }
  if (!entry) return;
  entry.quantity = Math.max(0, Number(entry.quantity || 0) + delta);
  const next = stock.filter(x => x.quantity > 0);
  await game.settings.set(MODULE_ID, STOCK_KEY, next);
  const chest = await ensureSharedChest();
  const container = chest?.items.find(i => i.getFlag(MODULE_ID, "sharedContainer"));
  if (chest && container) await syncChestItems(chest, container);
  game.socket.emit(SOCKET, {action:"refresh"});
}

function cardapioChat(actor, food, detail, extra = "") {
  const safe = value => foundry.utils.escapeHTML(String(value ?? ""));
  const content = `<section class="cardapio-consumo"><h3>${safe(food.name)}</h3><p>${safe(detail)}</p>${extra}<p><em>Consumido por ${safe(actor.name)}.</em></p></section>`;
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
}

async function addPendingBonus(actor, bonus) {
  const pending = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "pendingBonuses") ?? []);
  pending.push({ ...bonus, id: foundry.utils.randomID(), created: Date.now() });
  await actor.setFlag(MODULE_ID, "pendingBonuses", pending);
}

async function recoverSpellSlot(actor, food) {
  const spells = actor.system.spells ?? {};
  const available = Object.entries(spells)
    .filter(([key, slot]) => /^spell[1-9]$/.test(key) && Number(slot?.value ?? 0) < Number(slot?.max ?? 0))
    .map(([key, slot]) => ({ key, level: Number(key.replace("spell", "")), current: Number(slot.value ?? 0), max: Number(slot.max ?? 0) }));
  if (!available.length) {
    ui.notifications.warn(`${actor.name} não possui espaços de magia gastos para recuperar.`);
    await cardapioChat(actor, food, "Não havia espaços de magia gastos para recuperar.");
    return false;
  }

  const options = available.map(x => `<option value="${x.key}">Nível ${x.level} (${x.current}/${x.max} disponíveis)</option>`).join("");
  return new Promise(resolve => new Dialog({
    title: "Recuperar espaço de magia",
    content: `<form><div class="form-group"><label>Escolha o nível do espaço:</label><select name="spellLevel">${options}</select></div></form>`,
    buttons: {
      recover: { label: "Recuperar", callback: async html => {
        try {
          const key = html.find('[name="spellLevel"]').val();
          const slot = actor.system.spells[key];
          if (!slot || Number(slot.value) >= Number(slot.max)) return resolve(false);
          await actor.update({ [`system.spells.${key}.value`]: Number(slot.value) + 1 });
          await cardapioChat(actor, food, `Um espaço de magia de nível ${key.replace("spell", "")} foi recuperado.`);
          resolve(true);
        } catch (err) {
          console.error(`${MODULE_ID} | Falha ao recuperar espaço de magia`, err);
          ui.notifications.error("Não foi possível recuperar o espaço de magia.");
          resolve(false);
        }
      } },
      cancel: { label: "Cancelar", callback: () => resolve(false) }
    },
    default: "recover",
    close: () => resolve(false)
  }).render(true));
}

async function applyFood(actor, food) {
  switch (food.id) {
    case "espuma-kraken":
      await addPendingBonus(actor, { kind: "ability", ability: "con", formula: "1d4", label: "Espuma do Kraken" });
      await cardapioChat(actor, food, "Seu próximo teste de Constituição recebe +1d4.");
      break;

    case "hidromel-mares":
      await actor.update({ "system.attributes.inspiration": true });
      await cardapioChat(actor, food, "Você recebeu 1 Inspiração na ficha.");
      break;

    case "licor-sereia":
      await addPendingBonus(actor, { kind: "ability", ability: "dex", formula: "1d4", label: "Licor da Sereia" });
      await cardapioChat(actor, food, "Seu próximo teste de Destreza recebe +1d4.");
      break;

    case "vinho-algas":
      await recoverSpellSlot(actor, food);
      break;

    case "carapaca-crocante": {
      const effect = {
        name: "Carapaça Crocante (+1 CA)",
        img: food.image || "icons/consumables/food/bread-loaf-boule-rustic-brown.webp",
        origin: actor.uuid,
        disabled: false,
        transfer: false,
        changes: [{ key: "system.attributes.ac.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1", priority: 20 }],
        duration: { seconds: EFFECT_DURATION_SECONDS, startTime: game.time.worldTime },
        flags: { [MODULE_ID]: { foodId: food.id, temporaryFoodEffect: true } }
      };
      await actor.createEmbeddedDocuments("ActiveEffect", [effect]);
      await cardapioChat(actor, food, "Sua Classe de Armadura aumenta em +1 por 10 minutos.");
      break;
    }

    case "ensopado-sete-mares":
      await addPendingBonus(actor, { kind: "attack", formula: "2", label: "Ensopado dos Sete Mares" });
      await cardapioChat(actor, food, "Seu próximo ataque recebe +2 na jogada de ataque.");
      break;

    case "peixe-farol":
      await addPendingBonus(actor, { kind: "skill", skill: "prc", advantage: true, label: "Peixe do Farol" });
      await cardapioChat(actor, food, "Você tem vantagem no próximo teste de Percepção.");
      break;

    case "baiacu-flamejante":
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<section class="cardapio-consumo"><h3>${foundry.utils.escapeHTML(food.name)}</h3><p>Você pode usar uma ação bônus para liberar o fogo do baiacu.</p><button type="button" class="cardapio-roll-fire" data-actor-uuid="${actor.uuid}">Rolar 1d4 de dano de fogo</button></section>`
      });
      break;

    default:
      await cardapioChat(actor, food, food.effectText || "Benefício consumido.");
  }
}

// Os bônus ficam registrados no personagem até a próxima rolagem compatível.
async function consumePendingBonus(actor, predicate, config) {
  if (!actor || !config) return;
  const pending = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "pendingBonuses") ?? []);
  const index = pending.findIndex(predicate);
  if (index < 0) return;
  const bonus = pending[index];

  // Alterar a configuração antes do primeiro await garante que o modificador
  // entre na rolagem mesmo quando o hook do sistema é síncrono.
  config.parts ??= [];
  if (bonus.formula) config.parts.push(bonus.formula);
  if (bonus.advantage) config.advantage = true;

  pending.splice(index, 1);
  await actor.setFlag(MODULE_ID, "pendingBonuses", pending);
  ui.notifications.info(`${bonus.label}: benefício aplicado à rolagem.`);
}

Hooks.on("dnd5e.preRollAbilityTest", (actor, config) => {
  const ability = config?.ability ?? config?.abilityId;
  void consumePendingBonus(actor, bonus => bonus.kind === "ability" && bonus.ability === ability, config);
});
Hooks.on("dnd5e.preRollSkill", (actor, config) => {
  const skill = config?.skill ?? config?.skillId;
  void consumePendingBonus(actor, bonus => bonus.kind === "skill" && bonus.skill === skill, config);
});
Hooks.on("dnd5e.preRollAttack", (actor, config) => {
  void consumePendingBonus(actor, bonus => bonus.kind === "attack", config);
});

Hooks.on("renderChatMessage", (message, html) => {
  html.find(".cardapio-roll-fire").off("click.cardapio").on("click.cardapio", async event => {
    const button = event.currentTarget;
    if (button.disabled) return;
    button.disabled = true;
    try {
      const actor = await fromUuid(button.dataset.actorUuid);
      if (!actor) throw new Error("Personagem não encontrado.");
      const roll = await (new Roll("1d4[fire]")).evaluate();
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: "Baiacu Flamejante — dano de fogo (ação bônus)",
        flags: { [MODULE_ID]: { damageType: "fire" } }
      });
    } catch (err) {
      button.disabled = false;
      console.error(`${MODULE_ID} | Falha ao rolar dano do Baiacu`, err);
      ui.notifications.error("Não foi possível rolar o dano de fogo.");
    }
  });
});

async function migrateBundledItemImages() {
  if (!isGM()) return;
  const imageById = {
    "espuma-kraken": "modules/cardapio-do-capitao/assets/items/espuma-do-kraken.webp",
    "hidromel-mares": "modules/cardapio-do-capitao/assets/items/hidromel-das-mares.webp",
    "licor-sereia": "modules/cardapio-do-capitao/assets/items/licor-da-sereia.webp",
    "vinho-algas": "modules/cardapio-do-capitao/assets/items/vinho-de-algas.webp",
    "carapaca-crocante": "modules/cardapio-do-capitao/assets/items/carapaca-crocante.webp",
    "ensopado-sete-mares": "modules/cardapio-do-capitao/assets/items/ensopado-sete-mares.webp",
    "peixe-farol": "modules/cardapio-do-capitao/assets/items/peixe-do-farol.webp",
    "baiacu-flamejante": "modules/cardapio-do-capitao/assets/items/baiacu-flamejante.webp"
  };
  for (const key of [CATALOG_KEY, STOCK_KEY]) {
    const records = foundry.utils.deepClone(getSetting(key) ?? []);
    let changed = false;
    for (const record of records) {
      const path = imageById[record.id];
      if (path && record.image !== path) { record.image = path; changed = true; }
    }
    if (changed) await game.settings.set(MODULE_ID, key, records);
  }
}

async function seedInitialCatalog() {
  if (!isGM()) return;
  const current = getSetting(CATALOG_KEY) ?? [];
  const oldSampleIds = new Set(["pao", "ensopado", "cerveja"]);
  const isOldSample = current.length === 3 && current.every(item => oldSampleIds.has(item.id));
  if (!current.length || isOldSample) await game.settings.set(MODULE_ID, CATALOG_KEY, foundry.utils.deepClone(DEFAULT_CATALOG));

  if (!getSetting("catalogSeeded")) {
    const latestStock = getSetting(STOCK_KEY) ?? [];
    if (!latestStock.length) {
      const products = (getSetting(CATALOG_KEY) ?? DEFAULT_CATALOG).map(product => ({
        ...foundry.utils.deepClone(product), stockId: foundry.utils.randomID(), quantity: 1
      }));
      await game.settings.set(MODULE_ID, STOCK_KEY, products);
    }
    await game.settings.set(MODULE_ID, "catalogSeeded", true);
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, CATALOG_KEY, {name:"Catálogo de comidas", scope:"world", config:false, type:Array, default:DEFAULT_CATALOG});
  game.settings.register(MODULE_ID, STOCK_KEY, {name:"Baú do Grupo", scope:"world", config:false, type:Array, default:[]});
  game.settings.register(MODULE_ID, "catalogSeeded", {name:"Catálogo inicial carregado", scope:"world", config:false, type:Boolean, default:false});
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET, async data => {
    if (data.action === "stock" && isGM()) await updateStock(data.id, Number(data.delta));
    if (data.action === "refresh") {
      for (const app of Object.values(ui.windows)) if (app instanceof CardapioApp) app.render();
    }
  });
  game.settings.settings.get(`${MODULE_ID}.${STOCK_KEY}`);
  if (isGM()) seedInitialCatalog().then(() => migrateBundledItemImages()).then(() => ensureSharedChest()).catch(err => { console.error(`${MODULE_ID} | Falha ao criar Baú do Grupo`, err); ui.notifications.error("Não foi possível criar o Baú do Grupo. Consulte o console."); });
  game.cardapioCapitao = {
    open: () => new CardapioApp().render(true),
    addToStock: (id, amount=1) => updateStock(id, amount),
    openChest: async () => { const actor = await ensureSharedChest(); actor?.sheet.render(true); }
  };
});

Hooks.on("getSceneControlButtons", controls => {
  // Botão de acesso no grupo de controles; o mestre e jogadores podem abrir o cardápio.
  const tokenControls = controls.find(c => c.name === "token");
  if (!tokenControls) return;
  tokenControls.tools.push({
    name:"cardapio-capitao", title:"Cardápio do Capitão", icon:"fas fa-utensils",
    button:true, onClick:()=>game.cardapioCapitao?.open()
  });
});
