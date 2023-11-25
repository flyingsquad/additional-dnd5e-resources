const version = "10.0.8";
try {
	let level = args[0].spellLevel;
	const actorD = game.actors.get(args[0].actor._id);
	const tokenD = canvas.tokens.get(args[0].tokenId);
	const itemD = args[0].item;
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
    for (let target of all_targets) {
        targetList += `<tr><td>${target.name}</td><td><input type="num" id="target" min="0" max="${level}" name="${target.id}"></td></tr>`;
    }
    let the_content = `<p>Divide the <b>${level}</b> ${itemD.name} bolts among the targets.</p><form class="flexcol"><table width="100%"><tbody><tr><th>Target</th><th>Number Bolts</th></tr>${targetList}</tbody></table></form>`;
    new Dialog({
        title: `${itemD.name} Damage`,
        content: the_content,
        buttons: {
            damage: {
                label: "Damage", callback: async (html) => {
                    let spentTotal = 0;
                    let selected_targets = html.find('input#target');
                    for (let get_total of selected_targets) {
                        spentTotal += Number(get_total.value);
                    }
                    if (spentTotal > level)
						return ui.notifications.error(`Too many bolts assigned: ${spentTotal}; only ${level} available.`);
                    if (spentTotal === 0)
						return ui.notifications.error(`No bolts spent.`);
                    let damage_target = [];

					let i = 0;
                    for (let selected_target of selected_targets) {
                        let damageNum = selected_target.value;
                        if (damageNum) {
							let target = await fromUuid(args[0].hitTargetUuids[i] ?? "");
							let damageRoll = await new Roll(`${damageNum}d4+${damageNum}${empowered}`).roll({async: true});
							await new MidiQOL.DamageOnlyWorkflow(actor, token, damageRoll.total, "force", target ? [target] : [], damageRoll, {flavor: "Magic Missile - Damage Roll (Force)", itemCardId: args[0].itemCardId});
							i++;
                        }
                    }
                }
            }
        },
        default: "damage"
    }).render(true);
	
} catch (err) {
    console.error(`${args[0].itemData.name} - Magic Missile ${version}`, err);
}
