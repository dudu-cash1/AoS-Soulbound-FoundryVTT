import SoulboundUtility from "./utility"

export default class AgeOfSigmarEffect extends ActiveEffect {


    prepareData()
    {
        if (game.ready && this.item && this.item.equippable && this.requiresEquip && !this.parent.pack)
            this.disabled = !this.item.equipped
            //this.updateSource({"disabled" : !this.item.equipped})
    }

    /** @override 
     * Adds support for referencing actor data
     * */
    apply(actor, change) {
        if (change.value.includes("@"))
        {
            SoulboundUtility.log(`Deferring ${this.label} for ${this.parent?.name}`)
            if (change.value == "@doom" && !game.ready)
                actor.postReadyEffects.push(change)
            else
                actor.derivedEffects.push(change)
        }
        else
        {
            SoulboundUtility.log(`Applying ${this.label} to ${this.parent?.name}`)
            super.apply(actor, change)
        }
    }

    fillDerivedData(actor, change) {

        // See if change references an ID
        let matches = Array.from(change.value.matchAll(/@UUID\[Actor\.(.+?)\]\.system\.(.+)/gm));

        if (matches[0])
        {
            let [, id, path] = matches[0]
            // If matches, replace values
            actor = game.actors.get(id)
            
            if (!actor)
            return console.error(`ERROR.ReferencedActorNotFound`);
            change.value = "@" + path;
        }

        let data = (0, eval)(Roll.replaceFormulaData(change.value, actor.getRollData()))
        //Foundry Expects to find a String for numbers
        //Raw Numbers don't work anymore
        if(typeof data === "number") {
            change.value = data.toString();
        } else {
            change.value = data;
        }
        
    }
    
    get item() {
        if (this.parent && this.parent.documentName == "Item")
            return this.parent
        else if (this.origin && this.parent.documentName == "Actor") 
        {
            let origin = this.origin.split(".")
            if (this.parent && origin[1] == this.parent?.id) // If origin ID is same as parent ID
            {
                if (origin[3])
                {
                    return this.parent.items.get(origin[3])
                }
            }
        }
    }

    getDialogChanges({target = false, condense = false, indexOffset = 0}={}) {
        let allChanges = foundry.utils.deepClone(this.changes)
        allChanges.forEach((c, i) => {
            c.conditional = this.changeConditionals[i] || {}
            c.document = this
        })
        let dialogChanges = allChanges.filter((c) => c.mode == (target ? 7 : 6)) // Targeter dialog is 7, self dialog is 6
        dialogChanges.forEach((c, i) => {
            c.target = !!target
            c.index = [i + indexOffset]
            if (this.parent?.documentName == "Actor")
                this.fillDerivedData(this.parent, c)
        })

        // changes with the same description as under the same condition (use the first ones' script)

        if (condense)
        {
            let uniqueChanges = []
            dialogChanges.forEach(c => {
                let existing = uniqueChanges.find(unique => unique.conditional.description == c.conditional.description)
                if (existing)
                    existing.index = existing.index.concat(c.index)
                else
                    uniqueChanges.push(c)
            })
            dialogChanges = uniqueChanges
        }

        return dialogChanges
    }

    /**
     * Takes a test object and returns effect data populated with the results and overcasts computed
     * 
     * @param {Test} test 
     */
    static async populateEffectData(effectData, test, item)
    {
        effectData.origin = test.actor.uuid

        // Set statusId so that the icon shows on the token
        setProperty(effectData, "flags.core.statusId", getProperty(effectData, "flags.core.statusId") || effectData.label.slugify())
        
        if(!item)  
            item = test.item

        // Prioritize test result duration over item duration (test result might be overcasted)
        let duration = test.result.duration || item.duration
        if (duration)
        {
            if (duration.unit == "round")
                effectData.duration.rounds = parseInt(duration.value)
            else if  (duration.unit == "minute")
                effectData.duration.seconds = parseInt(duration.value) * 60
            else if (duration.unit == "hour")
                effectData.duration.seconds = parseInt(duration.value) * 60 * 60
            else if (duration.unit == "day")
                effectData.duration.seconds = parseInt(duration.value) * 60 * 60 * 24
        }

        // Some effects (e.g. Aethyric Armour) may need to take from test data to fill its change value (to match with possible overcasts)
        // These effects have a change value of `@test.result.<some-property>`
        for(let change of effectData.changes)
        {
            let split = change.value.split(".")
            // Remove @test and replace it with the value
            let value = change.value
            if (split[0] == "@test")
            {
                // Remove @test and get the property from the test (@test.result.damage.total -> result.damage.total -> actual value)
                split.splice(0, 1)
                value = split.join(".")
                value = getProperty(test, value)
            }

            // Get referential derived data from a different actor
            if (split[0].includes("@UUID"))
            {
                change.value = change.value.replace("Actor.ID", `Actor.${test.actor.id}`)
            }

            if (Number.isNumeric(value))
                change.value = parseInt(value)
            else if (!change.value.includes("@UUID"))
                change.value = 0
        }


        return effectData


    }

    get changeConditionals() {
        return (getProperty(this.data, "flags.age-of-sigmar-soulbound.changeCondition") || {})
    }

    get description() {
        return getProperty(this.data, "flags.age-of-sigmar-soulbound.description")
    }

    get hasRollEffect() {
        return this.changes.some(c => c.mode == 0)
    }

    get sourceName() {
        if (!this.origin)
            return super.sourceName

        let data = this.origin.split(".")

        if (length == 4) {

            if (this.origin.includes("Drawing"))
            {
                let scene = game.scenes.get(data[1])
                let drawing = scene.drawings.get(data[3])
                let zone = drawing?.data?.text
                if (zone)
                    return zone
            }


            let item = this.parent.items.get(data[3])
            if (item)
                return item.name
        }
        
        return super.sourceName

    }

    get requiresEquip() {
        return this.getFlag("age-of-sigmar-soulbound", "requiresEquip")
    }

    get isCondition() {
        return CONFIG.statusEffects.map(i => i.id).includes(this.getFlag("core", "statusId"))
    }

    static get numericTypes() {
        return ["difficulty",
            "complexity",
            "bonusDice",
            "bonusFocus",
            "bonusDamage",
            "armour",
            "defence",
            "attack"]
    }

}