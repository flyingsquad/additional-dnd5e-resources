export class CastSpells {
	version = "10.0.8";

	async magicMissile(args) {
		try {

			function count(html) {
				let total = 0;
				let selected_targets = html.find('input#target');
				for (let get_total of selected_targets) {
					if (get_total.checked) {
						total += Number(get_total.value);
					}
				}
				html.find("#total").text(total);
				html.find("#remaining").text(level-total);
			}

			function handleRender(html) {
				count(html);
				html.on('change', html, (e) => {
					let html = e.data;
					switch (e.target.nodeName) {
					case 'INPUT':
						count(html);
						break;
					}
				});
			}

			let level = args[0].spellLevel;
			const actor = game.actors.get(args[0].actor._id);
			const token = canvas.tokens.get(args[0].tokenId);
			const item = args[0].item;
			const itemUuid = await fromUuid(args[0].uuid);
			const damageType = "force";
			const empowered = actor.items.find(it => it.name == "Empowered Evocation") ? `+${actor.system.abilities.int.mod}` : '';
			
			if (args[0].hitTargetUuids.length <= 1) {
				let target = await fromUuid(args[0].hitTargetUuids[0] ?? "");
				let numDice = 2 + level;

				let damageRoll = await new Roll(`${numDice}d4+${numDice}${empowered}`).roll({async: true});
				new MidiQOL.DamageOnlyWorkflow(actor, token, damageRoll.total, "force", target ? [target] : [], damageRoll, {flavor: "Magic Missile - Damage Roll (Force)", itemCardId: args[0].itemCardId});
				return;
			}

			level += 2;

			let targetList = "";
			let all_targets = args[0].targets;
			let t = 1;
			for (let target of all_targets) {
				let buttons = '';
				for (let i = 0; i <= level; i++) {
					buttons += `<input type="radio" id="target" name="${target.id}" value="${i}"${i==0?' checked':''}><label for="target${t}">${i}</label>&nbsp;`;
				}
				targetList += `<tr><td>${target.name}</td><td style="align: center">${buttons}</td></tr>`;
				t++;
			}
			let the_content = `<p>Divide the <b>${level}</b> ${item.name} bolts among the targets.</p><form class="flexcol"><table width="100%"><tbody><tr><th style="align: left">Target</th><th style="align: left">Number of Bolts -- Total <span id="total">0</span>/<span id="remaining">${level}</span> remaining</th></tr>${targetList}</tbody></table></form>`;
			new Dialog({
				title: `${item.name} Damage`,
				content: the_content,
				buttons: {
					damage: {
						label: "Damage", callback: async (html) => {
							let spentTotal = 0;
							let missiles = [];
							let selected_targets = html.find('input#target');
							let i = 0;
							for (let get_total of selected_targets) {
								let cardId;
								if (get_total.checked) {
									spentTotal += Number(get_total.value);
									if (i++ == 0) {
										cardId = args[0].itemCardId;
									} else {
										let msgData = {
											speaker: ChatMessage.getSpeaker({token: actor}),
											type: CONST.CHAT_MESSAGE_TYPES.ROLL,
											content:``
										};
										//let msg = await ChatMessage.create(msgData, {chatBubble: false});
										//cardId = msg._id;
										cardId = "";
									}
									missiles.push({nbolts: Number(get_total.value), cardId: cardId});
								}
							}
							if (spentTotal > level)
								return ui.notifications.error(`Too many bolts assigned: ${spentTotal}; only ${level} available.`);
							if (spentTotal === 0)
								return ui.notifications.error(`No bolts spent.`);
							let damage_target = [];

							i = 0;
							for (let selected_target in missiles) {
								let damageNum = missiles[i].nbolts;
								if (damageNum) {
									let target = await fromUuid(args[0].hitTargetUuids[i] ?? "");
									let damageRoll = await new Roll(`${damageNum}d4+${damageNum}${empowered}`).roll({async: true});
									await new MidiQOL.DamageOnlyWorkflow(actor, token, damageRoll.total, "force", target ? [target] : [], damageRoll, {flavor: "Magic Missile - Damage Roll (Force)", itemCardId: missiles[i].cardId});
									i++;
								}
							}
						}
					}
				},
				default: "damage",
				render: (html) => { handleRender(html); }
			}, {width: 500}).render(true);
			
		} catch (err) {
			console.error(`${args[0].itemData.name} - Magic Missile ${this.version}`, err);
		}
	}
	
	async spiritualWeapon(actor, args) {
		try {
		  const origin = args[0].itemUuid;
		  if (origin) {
			  const removeList = actor.effects.filter(ae => ae.origin === origin && getProperty(ae, "flags.dae.transfer") !== 3).map(ae=>ae.id);
			  await actor.deleteEmbeddedDocuments("ActiveEffect", removeList)
		  }
		  const spellAbil = actor.system.attributes.spellcasting;
		  const spellMod = Number(actor.system.abilities[spellAbil].mod);
		  const prof = Number(actor.system.attributes.prof);
		  const spellAtt = Number(actor.system.bonuses.msak.attack);
		  const attBonus = spellMod + prof + spellAtt;
		  const updates = {
			  Item: {
			  "Spiritual Weapon Attack": {
				"type": "weapon",
				"img": args[0].itemData.img, 
				"system.actionType" : "msak",
				"system.activation.type": "action",
				"system.properties.mgc": true,
				"system.attackBonus": attBonus,
				"system.proficient": false,
				"system.range": { "value": 5, "units": "ft"},
				"system.damage.parts":[[`${1 + Math.floor((args[0].spellLevel-2)/2)}d8 + ${args[0].actor.system.abilities[args[0].actor.system.attributes.spellcasting]?.mod || ""}`,"force"]]
			  }
			}
		  }
		  const result = await warpgate.spawn("Spiritual Weapon",  {embedded: updates}, {}, {});
		  if (result.length !== 1) return;
		  const createdToken = game.canvas.tokens.get(result[0]);
		  await createdToken.actor.items.getName("Spiritual Weapon Attack").update({"data.proficient": false});
		  const targetUuid = createdToken.document.uuid;

		  await actor.createEmbeddedDocuments("ActiveEffect", [{
			  name: "Summon", 
			  icon: args[0].item.img, 
			  origin,
			  duration: {seconds: 60, rounds:10},
			  "flags.dae.stackable": false,
			  changes: [{key: "flags.dae.deleteUuid", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: [targetUuid]}]
		  }]);
		} catch (err) {
			console.error(`${args[0].itemData.name} - Spiritual Weapon ${version}`, err);
		}
	}

	async flamingSphere(actor, args) {
		try {
		  const origin = args[0].itemUuid;
		  if (origin) {
			  const removeList = actor.effects.filter(ae => ae.origin === origin && getProperty(ae, "flags.dae.transfer") !== 3).map(ae=>ae.id);
			  await actor.deleteEmbeddedDocuments("ActiveEffect", removeList)
		  }
		  const spellAbil = actor.system.attributes.spellcasting;
		  const spellMod = Number(actor.system.abilities[spellAbil].mod);
		  const prof = Number(actor.system.attributes.prof);
		  const dc = 8 + spellMod + prof;
		  const updates = {
			  Item: {
			  "Flaming Sphere Attack": {
				"type": "weapon",
				"img": args[0].itemData.img, 
				"system.actionType" : "save",
				"system.activation.type": "action",
				"system.range": { "value": 5, "units": "ft"},
				"system.properties.mgc": true,
				"system.save": {"ability": "dex", "dc": dc, "scaling": "flat"},
				"system.proficient": false,
				"system.damage.parts":[[`${2 + Math.floor((args[0].spellLevel-2))}d6`,"fire"]]
			  }
			}
		  }
		  const result = await warpgate.spawn("Flaming Sphere",  {embedded: updates}, {}, {});
		  if (result.length !== 1) return;
		  const createdToken = game.canvas.tokens.get(result[0]);
		  await createdToken.actor.items.getName("Flaming Sphere Attack").update({"data.proficient": false});
		  const targetUuid = createdToken.document.uuid;

		  await actor.createEmbeddedDocuments("ActiveEffect", [{
			  name: "Summon", 
			  icon: args[0].item.img, 
			  origin,
			  duration: {seconds: 60, rounds:10},
			  "flags.dae.stackable": false,
			  changes: [{key: "flags.dae.deleteUuid", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: [targetUuid]}]
		  }]);
		} catch (err) {
			console.error(`${args[0].itemData.name} - Flaming Sphere ${version}`, err);
		}
	}

	async arcaneHand(actor, args) {
		try {
		  const origin = args[0].itemUuid;
		  if (origin) {
			  const removeList = actor.effects.filter(ae => ae.origin === origin && getProperty(ae, "flags.dae.transfer") !== 3).map(ae=>ae.id);
			  await actor.deleteEmbeddedDocuments("ActiveEffect", removeList)
		  }
		  const spellAbil = actor.system.attributes.spellcasting;
		  const spellMod = Number(actor.system.abilities[spellAbil].mod);
		  const prof = Number(actor.system.attributes.prof);
		  const dc = 8 + spellMod + prof;

		  const result = await warpgate.spawn("Arcane Hand",  {}, {}, {});
		  if (result.length !== 1) return;
		  const createdToken = game.canvas.tokens.get(result[0]);

		  let crs = [];
		  crs[3] = 5;
		  crs[4] = 9;
		  crs[5] = 13;
		  crs[6] = 17;

		  await createdToken.actor.update({"system.abilities.int": actor.system.abilities.int});
		  const hp = actor.system.attributes.hp.max;
		  await createdToken.actor.update({"system.attributes.hp.value": hp});
		  await createdToken.actor.update({"system.attributes.hp.max": hp});
		  await createdToken.actor.update({"system.details.cr": crs[actor.system.attributes.prof]});

		  let updates = [{_id: createdToken.id, name: `${actor.name}'s Hand`}];
		  canvas.scene.updateEmbeddedDocuments("Token", updates);

		  const targetUuid = createdToken.document.uuid;

		  await actor.createEmbeddedDocuments("ActiveEffect", [{
			  name: "Summon", 
			  icon: args[0].item.img, 
			  origin,
			  duration: {seconds: 60, rounds:10},
			  "flags.dae.stackable": false,
			  changes: [{key: "flags.dae.deleteUuid", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: [targetUuid]}]
		  }]);
		} catch (err) {
			console.error(`${args[0].itemData.name} - Arcane Hand`, err);
		}
	}

	async savageAttacker(actor, args) {
		const version = "10.0.10";
		try {
			if (args[0].macroPass === "preDamageRoll") {
				const isCritical = args[0].attackD20 >= args[0].attackRoll.options.critical;
				const theItem = await fromUuid(args[0].uuid);
				let formula = theItem.system.damage.parts[0][0];
				if (!theItem.flags.savageAttacker) {
					theItem.flags['savageAttacker'] = {baseDamage: formula};
				} else {
					formula = theItem.flags.savageAttacker.baseDamage;
				}
				if (isCritical) {
					let result = formula.match(/^[0-9]*/);
					if (result[0] == "") {
						formula = `max(2${formula},2${formula})`;
					} else {
						let critDmg = formula.replace(result[0], 2*parseInt(result[0]));
						formula = `max(${critDmg},${critDmg})`;
					}
				} else {
					formula = `max(${formula},${formula})`;
				}
				theItem.system.damage.parts[0][0] = formula;
			}
		} catch (err) {
			console.error(`${args[0].itemData.name} - Savage Attacker ${version}`, err);
		}	
	}
	
	async test(actor, args) {
		const version = "10.0.10";
		try {
			// See if feat already used this turn.
			let flags = actor.flags['additional-dnd5e-resources']?.savageAttacker;
			let lastRound = flags?.round;
			let curRound = game?.combat?.round;
			let cid = game?.combat?.id;

			if (lastRound !== undefined && curRound !== undefined) {
				// Don't ask if feat already used this turn.
				if (cid == flags.cid && curRound <= lastRound)
					return;
			}
			// Check if attack hit.
			let wf = args[0].workflow;
			if (!wf.damageRoll)
				return;

			let result = await Dialog.confirm({
			  title: "Reroll damage?",
			  content: `<p>Do you want to reroll damage for Savage Attacker?</p>
				<p>Total: ${wf.damageRoll.total} = ${showDice(wf.damageRoll.terms)}</p>`,
			  yes: (html) => { return true; },
			  no: (html) => { return false; },
			  close: () => { return false; }
			});
			if (result) {
				await actor.setFlag('additional-dnd5e-resources', 'savageAttacker', {round: curRound, cid: cid});
				let formula = wf.damageRoll._formula;
				let r = new Roll(formula);
				await r.evaluate();
				let newDamage = r._total;
//				ChatMessage.create({rolls: [r], content: `Roll: ${r.total} = ${showDice(r.terms)}`});
				await r.toMessage({
					rollMode: 'roll',
					flavor: `Savage Attacker damage reroll`,
					speaker: {alias: actor.name}
				});
				let extraDmg = r.total - wf.damageRoll.total;
				if (extraDmg > 0) {
					// Apply this new damage to the target.
				}
			}
		} catch (err) {
				console.error(`${args[0].itemData.name} - Longsword of Sharpness ${version}`, err);
				return {}
		}	
	}

	async savageAttackerFunc({speaker, actor, token, character, item, args, scope, workflow}) {
		function showDice(terms) {
			let string = '';
			for (let i = 0; i < terms.length; i++) {
				let term = terms[i];
				if (term.faces) {
					let plus = '';
					for (let r = 0; r < term.number; r++) {
						string += plus + term.results[r].result + '/' + term.faces;
						plus = "+";
					}
				} else {
					string += term.total;
				}
			}
			return string;
		}

		if (workflow.hitTargets.size != 1 || workflow.item.system.actionType != 'mwak' || !workflow.token || !workflow.damageRoll) return;

		let flags = actor.flags['additional-dnd5e-resources']?.savageAttacker;
		let lastRound = flags?.round;
		let curRound = game?.combat?.round;
		let cid = game?.combat?.id;

		if (lastRound !== undefined && curRound !== undefined) {
			// Don't ask if feat already used this turn.
			if (cid == flags.cid && curRound <= lastRound)
				return;
		}

		await workflow.damageRoll.toMessage({
			rollMode: 'roll',
			flavor: `Initial Damage Roll`,
			speaker: {alias: actor.name}
		});

		let result = await Dialog.confirm({
		  title: "Reroll damage?",
		  content: `<p>Do you want Savage Attacker to reroll damage?</p>
			<p>Total: ${workflow.damageRoll.total} = ${showDice(workflow.damageRoll.terms)}</p>`,
		  yes: (html) => { return true; },
		  no: (html) => { return false; },
		  close: () => { return false; }
		});

		if (result) {
			await actor.setFlag('additional-dnd5e-resources', 'savageAttacker', {round: curRound, cid: cid});
			let formula = workflow.damageRoll._formula;
			let r = new Roll(formula);
			await r.evaluate();
			let newDamage = r._total;

			await r.toMessage({
				rollMode: 'roll',
				flavor: `Savage Attacker damage reroll`,
				speaker: {alias: actor.name}
			});
			if (r.total > workflow.damageRoll.total)
			    await workflow.setDamageRoll(r);
		}
	}
}



Hooks.once('init', async function () {
	if (!game.CastSpells) {
		game.CastSpells = new CastSpells();
		CONFIG.CastSpells = {savageAttacker: game.CastSpells.savageAttackerFunc};
	}
});
