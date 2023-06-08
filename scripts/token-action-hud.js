import { TagDialogHelper } from './dialogs/tag-dialog-helper.js'
import { CategoryResizer } from './utilities/category-resizer.js'
import { MODULE, STYLE_CLASS } from './constants.js'
import { Logger, Timer, Utils } from './utilities/utils.js'

/**
 * Token Action HUD application
 */
export class TokenActionHud extends Application {
    // Set defaults
    hoveredGroups = []
    defaults = {}
    defaultHeight = 200
    defaultWidth = 20
    defaultLeftPos = 150
    defaultTopPos = 80
    leftPos = this.defaultLeftPos
    topPos = this.defaultTopPos
    defaultScale = 1
    refreshTimeout = null
    rendering = false
    tokens = null
    isUpdatePending = false
    isUpdating = false
    updateTimer = new Timer(20)

    constructor (module, systemManager) {
        super()
        this.module = module
        this.systemManager = systemManager
        this.autoDirection = 'down'
        this.direction = 'down'
        this.isAlwaysShow = false
        this.isClickOpen = false
        this.isCollapsed = false
        this.isCustomizationEnabled = false
        this.isDisplayIcons = false
        this.isDraggable = false
        this.isEnabled = false
        this.isHudEnabled = false
        this.isGrid = false
        this.isUnlocked = false
        this.style = null
    }

    /**
     * Initialise the HUD
     * @public
     */
    async init () {
        this.direction = Utils.getSetting('direction')
        this.isAlwaysShow = Utils.getSetting('alwaysShowHud')
        this.isClickOpen = Utils.getSetting('clickOpenCategory')
        this.isCollapsed = Utils.getUserFlag('isCollapsed')
        this.isCustomizationEnabled = Utils.getSetting('enableCustomization')
        this.isDebug = Utils.getSetting('debug')
        this.isDisplayIcons = Utils.getSetting('displayIcons')
        this.isDraggable = Utils.getSetting('drag')
        this.isEnabled = Utils.getSetting('enable')
        this.isHudEnabled = this._getHudEnabled()
        this.isGrid = Utils.getSetting('grid')
        this.isUnlocked = Utils.getUserFlag('isUnlocked')
        this.style = Utils.getSetting('style')
        await this.systemManager.registerDefaultFlags()
        this.categoryResizer = new CategoryResizer()
        this.actionHandler = await this.systemManager.getActionHandler()
        this.rollHandler = this.systemManager.getRollHandler()
    }

    /**
     * Update Token Action HUD following change to module settings
     * @public
     */
    updateSettings () {
        Logger.debug('Updating settings...')
        this.updateRollHandler()
        this.direction = Utils.getSetting('direction')
        this.isAlwaysShow = Utils.getSetting('alwaysShowHud')
        this.isClickOpen = Utils.getSetting('clickOpenCategory')
        this.isCustomizationEnabled = Utils.getSetting('enableCustomization')
        this.actionHandler.isCustomizationEnabled = this.isCustomizationEnabled
        this.isDebug = Utils.getSetting('debug')
        this.isDisplayIcons = Utils.getSetting('displayIcons')
        this.actionHandler.displayIcons = this.isDisplayIcons
        this.isDraggable = Utils.getSetting('drag')
        this.isEnabled = Utils.getSetting('enable')
        this.isHudEnabled = this._getHudEnabled()
        this.isGrid = Utils.getSetting('grid')
        this.style = Utils.getSetting('style')
        Logger.debug('Settings updated')
        const trigger = { trigger: { type: 'method', name: 'TokenActionHud#updateSettings' } }
        this.update(trigger)
    }

    /**
     * Update the RollHandler
     * @public
     */
    updateRollHandler () {
        this.rollHandler = this.systemManager.getRollHandler()
    }

    /**
     * Set the tokens variable
     * @public
     * @param {object} tokens Tokens on the canvas
     */
    setTokens (tokens) {
        this.tokens = tokens
    }

    /**
     * Merge Token Action Hud's default options with Application
     * @override
     */
    static get defaultOptions () {
        return mergeObject(super.defaultOptions, {
            template: `/modules/${MODULE.ID}/templates/template.hbs`,
            id: 'token-action-hud',
            classes: [],
            width: this.defaultWidth,
            height: this.defaultHeight,
            left: this.defaultLeftPos,
            top: this.defaultTopPos,
            scale: this.defaultScale,
            background: 'none',
            popOut: false,
            minimizable: false,
            resizable: false,
            title: 'token-action-hud',
            dragDrop: [],
            tabs: [],
            scrollY: []
        })
    }

    /**
     * Get Token Action Hud scale
     * @private
     * @returns {number} The scale
     */
    _getScale () {
        const scale = parseFloat(Utils.getSetting('scale'))
        if (scale < 0.5) return 0.5
        if (scale > 2) return 2
        return scale
    }

    /**
     * Get data
     * @override
     */
    getData (options = {}) {
        const data = super.getData()
        data.hud = this.hud
        data.id = 'token-action-hud'
        data.style = STYLE_CLASS[this.style].class
        data.scale = this._getScale()
        data.background = '#00000000'
        Logger.debug('Application data', { data })

        return data
    }

    /**
     * Activate listeners
     * @override
     */
    activateListeners (html) {
        const elements = {
            action: html.find('.tah-action'),
            buttons: html.find('#tah-buttons'),
            tabGroup: html.find('.tah-tab-group'),
            groups: html.find('#tah-groups'),
            editHudButton: html.find('#tah-edit-hud'),
            listGroups: html.find('.tah-list-groups'),
            group: html.find('.tah-group'),
            subtitle: html.find('.tah-subtitle'),
            groupButton: html.find('.tah-group-button'),
            collapseHudButton: html.find('#tah-collapse-hud'),
            expandHudButton: html.find('#tah-expand-hud'),
            unlockButton: html.find('#tah-unlock'),
            lockButton: html.find('#tah-lock')
        }

        // Bind event listeners
        this._bindGroupEvents(elements)
        this._bindActionEvents(elements)
        this._bindEditHudButton(elements)
        this._bindLockUnlockButtons(elements)
        this._bindCollapseExpandButtons(elements)
    }

    /**
     * Post-render HUD
     */
    postRender () {
        this.applySettings()

        // Resize category
        if (this.hoveredGroups.length) {
            for (const groupId of this.hoveredGroups) {
                const group = document.querySelector(`#${groupId}`)
                this.categoryResizer.resizeCategory(this.actionHandler, group, this.autoDirection, this.isGrid)
            }
        }
    }

    /**
    * Bind category events
    * @private
    */
    _bindGroupEvents (elements) {
        /**
         * Close the group
         * @param {object} event The event
         */
        const closeGroup = (event) => {
            if (game.tokenActionHud.rendering) return
            const group = (this.isClickOpen) ? event.currentTarget.parentElement : event.currentTarget
            group.classList.remove('hover')
            const closestGroupElement = group.closest('.tah-group')
            let sibling = closestGroupElement?.nextElementSibling
            while (sibling) {
                if (sibling.classList.contains('tah-group')) {
                    sibling.classList.remove('tah-hidden')
                }
                sibling = sibling.nextElementSibling
            }
            this._clearHoveredGroup(group.id)
        }

        /**
         * Open the group
         * @param {object} event The event
         */
        const openGroup = async (event) => {
            const group = (this.isClickOpen) ? event.currentTarget.parentElement : event.currentTarget
            group.classList.add('hover')
            const closestGroupElement = group.closest('.tah-group')
            let sibling = closestGroupElement?.nextElementSibling
            while (sibling) {
                if (sibling.classList.contains('tah-group')) {
                    sibling.classList.add('tah-hidden')
                }
                sibling = sibling.nextElementSibling
            }
            this.categoryResizer.resizeCategory(this.actionHandler, group, this.autoDirection, this.isGrid)
            this._setHoveredGroup(group.id)
        }

        /**
         * Toggle the group
         * @param {object} event The event
         */
        const toggleGroup = (event) => {
            const group = event.currentTarget.parentElement
            if (group.classList.contains('hover')) {
                closeGroup(event)
            } else {
                const groupElements = group.parentElement.querySelectorAll('.tah-tab-group')
                for (const groupElement of groupElements) {
                    groupElement.classList.remove('hover')
                    this._clearHoveredGroup(groupElement.id)
                }
                openGroup(event)
            }
            // Remove focus to allow core ESC interactions
            event.currentTarget.blur()
        }

        // Bring HUD to top
        elements.groupButton.on('click', (event) => {
            this.bringToTop()
            // Remove focus to allow core ESC interactions
            event.currentTarget.blur()
        })

        if (this.isClickOpen) {
            // When a category button is clicked...
            elements.groupButton.on('click', toggleGroup)
        } else {
            // When a category button is hovered over...
            elements.tabGroup.get().forEach(element => {
                element.addEventListener('touchstart', toggleGroup, { passive: true })
            })
            elements.tabGroup.hover(openGroup, closeGroup)
        }

        // When a category button is clicked and held...
        elements.groupButton.on('mousedown', (event) => this._dragEvent(event))
        elements.groupButton.get().forEach(element => {
            element.addEventListener('touchstart', (event) => this._dragEvent(event), { passive: true })
        })

        /**
         * Open the group dialog
         * @param {object} event
         */
        const openGroupDialog = (event) => {
            const target = event.currentTarget
            if (!target?.parentElement?.dataset?.nestId) return

            const nestId = target?.parentElement?.dataset?.nestId
            const name = target?.parentElement?.dataset?.name ?? target.innerText ?? target.outerText
            const level = parseInt(target?.parentElement?.dataset?.level) || null
            const type = target?.parentElement?.dataset?.type

            TagDialogHelper.showGroupDialog(
                this.actionHandler,
                { nestId, name, level, type }
            )
        }

        // When a category button is right-clicked...
        elements.groupButton.on('contextmenu', (event) => {
            if (this.isUnlocked && event.currentTarget.parentElement.dataset.level === '1') {
                openGroupDialog(event)
            }
        })
    }

    /**
     * Bind action events
     * @private
     * @param {object} elements The DOM elements
     */
    _bindActionEvents (elements) {
        /**
         * Handle action event
         * @param {object} event The event
         */
        const handleAction = (event) => {
            let target = event.target

            if (target.tagName !== 'BUTTON') target = event.currentTarget.children[0]
            const value = target.value
            try {
                this.rollHandler.handleActionEvent(event, value, this.actionHandler)
                target.blur()
            } catch (error) {
                Logger.error(event)
            }
        }

        /**
         * Open the Action dialog
         * @param {object} event The event
         */
        const openActionDialog = (event) => {
            const target = (event.target.classList.contains('tah-button-text'))
                ? event.target.closest('.tah-tab-group')
                : event.target.closest('.tah-group')
            if (!target?.dataset?.nestId) return
            const nestId = target?.dataset?.nestId
            const name = event.target.innerText ?? event.target.outerText
            const level = parseInt(target?.dataset?.level) || null
            const type = target?.dataset?.type

            TagDialogHelper.showActionDialog(
                this.actionHandler,
                { nestId, name, level, type }
            )
        }

        /**
         * Collapse/expand group
         * @param {object} event                   The event
         * @param {boolean} isCustomizationEnabled Whether customization is enabled
         */
        const collapseExpandGroup = (event, isCustomizationEnabled) => {
            const target = event.target.classList.contains('tah-subtitle-text')
                ? event.target.parentElement
                : event.target
            const groupElement = target?.closest('.tah-group')
            const nestId = groupElement?.dataset?.nestId
            const tabGroup = target.closest('.tah-tab-group.hover')
            const groupsElement = groupElement?.querySelector('.tah-groups')
            const collapseIcon = target.querySelector('.tah-collapse-icon')
            const expandIcon = target.querySelector('.tah-expand-icon')
            const imageElement = groupElement.querySelector('.tah-list-image')

            const toggleGroupVisibility = () => {
                groupsElement?.classList.toggle('tah-hidden')
                collapseIcon?.classList.toggle('tah-hidden')
                expandIcon?.classList.toggle('tah-hidden')
                imageElement?.classList.toggle('tah-hidden')
            }

            const saveGroupSettings = (collapse) => {
                if (isCustomizationEnabled) {
                    this.actionHandler.saveGroupSettings({ nestId, settings: { collapse } })
                }
            }

            if (groupsElement?.classList.contains('tah-hidden')) {
                toggleGroupVisibility()
                saveGroupSettings(false)
                this.categoryResizer.resizeCategory(this.actionHandler, tabGroup, this.autoDirection, this.isGrid)
            } else {
                toggleGroupVisibility()
                saveGroupSettings(true)
            }
        }

        // When a subcategory title is right-clicked...
        elements.subtitle.on('contextmenu', (event) => {
            if (this.isUnlocked) openActionDialog(event)
        })

        // When a subcategory title is clicked...
        elements.subtitle.on('click', (event) => {
            if (event.target.classList.contains('tah-button-text')) return
            collapseExpandGroup(event, this.isCustomizationEnabled)
        })

        // When an action is clicked or right-clicked...
        elements.action.on('click contextmenu', (event) => {
            event.preventDefault()
            handleAction(event)
        })

        elements.groupButton.on('contextmenu', (event) => {
            if (this.isUnlocked && event.currentTarget.parentElement.dataset.level !== '1') {
                openActionDialog(event)
            }
        })
    }

    /**
     * Bind 'Edit HUD' button
     * @private
     */
    _bindEditHudButton (elements) {
        // When the 'Edit HUD' button is clicked...
        elements.editHudButton.on('click', (event) => {
            event.preventDefault()
            event = event || window.event
            TagDialogHelper.showHudDialog(this.actionHandler)
        })
    }

    /**
     * Bind lock and unlock buttons
     * @private
     */
    _bindLockUnlockButtons (elements) {
        /**
         * Unlock the HUD
         * @param {object} event
         */
        const unlockHud = async (event) => {
            if (event) {
                event.preventDefault()
            }

            const target = event?.target || elements.unlockButton
            $(target).addClass('tah-hidden')
            elements.editHudButton.removeClass('tah-hidden')
            elements.group.removeClass('tah-hidden')
            elements.groupButton.removeClass('disable-edit')
            elements.groups.addClass('tah-unlocked')
            elements.listGroups.removeClass('tah-hidden')
            elements.lockButton.removeClass('tah-hidden')
            elements.tabGroup.removeClass('tah-hidden')
            elements.subtitle.removeClass('disable-edit tah-hidden')

            if (!this.isUnlocked) {
                await Utils.setUserFlag('isUnlocked', true)
                this.isUnlocked = true
            }
        }

        /**
         * Lock the HUD
         * @param {object} event
         */
        const lockHud = async (event = null) => {
            if (event) {
                event.preventDefault()
            }
            const target = event?.target || elements.lockButton
            $(target).addClass('tah-hidden')
            elements.unlockButton.removeClass('tah-hidden')
            elements.editHudButton.addClass('tah-hidden')
            elements.groups.removeClass('tah-unlocked')
            for (const topGroupElement of elements.tabGroup) {
                const hasActions = (topGroupElement.getElementsByClassName('tah-action').length > 0)
                if (!hasActions) topGroupElement.classList.add('tah-hidden')
            }
            for (const groupElement of elements.group) {
                const hasActions = (groupElement.getElementsByClassName('tah-action').length > 0)
                if (!hasActions) groupElement.classList.add('tah-hidden')
            }
            for (const listGroupsElement of elements.listGroups) {
                const hasActions = (listGroupsElement.getElementsByClassName('tah-action').length > 0)
                if (!hasActions) listGroupsElement.classList.add('tah-hidden')
            }
            for (const subtitleElement of elements.subtitle) {
                const groupElement = subtitleElement.closest('.tah-group')
                if (groupElement?.dataset?.showTitle === 'false') {
                    subtitleElement.classList.add('tah-hidden')
                }
            }
            elements.groupButton.addClass('disable-edit')
            elements.subtitle.addClass('disable-edit')
            if (this.isUnlocked) {
                await Utils.setUserFlag('isUnlocked', false)
                this.isUnlocked = false
            }
        }

        // Set initial lock state
        if (this.isUnlocked && this.isCustomizationEnabled) {
            unlockHud()
        } else {
            lockHud()
        }

        if (!this.isCustomizationEnabled) {
            elements.unlockButton.addClass('tah-hidden')
        }

        // Add event listeners
        elements.unlockButton.on('click', unlockHud)
        elements.lockButton.on('click', lockHud)
    }

    /**
     * Bind collapse and expand buttons
     * @private
     */
    _bindCollapseExpandButtons (elements) {
        /**
         * Collapse the HUD
         * @param {object} event The event
         */
        const collapseHud = (event = null) => {
            if (event) {
                event.preventDefault()
                event = event || window.event
            }
            const target = event?.target || elements.collapseHudButton
            $(target).addClass('tah-hidden')
            elements.expandHudButton.removeClass('tah-hidden')
            elements.groups.addClass('tah-hidden')
            elements.buttons.addClass('tah-hidden')
            if (!this.isCollapsed) {
                Utils.setUserFlag('isCollapsed', true)
                this.isCollapsed = true
            }
        }

        /**
         * Expand the HUD
         * @param {object} event The event
         */
        const expandHud = (event) => {
            event.preventDefault()
            event = event || window.event
            $(event.target).addClass('tah-hidden')
            elements.collapseHudButton.removeClass('tah-hidden')
            elements.groups.removeClass('tah-hidden')
            elements.buttons.removeClass('tah-hidden')
            if (this.isCollapsed) {
                Utils.setUserFlag('isCollapsed', false)
                this.isCollapsed = false
            }
        }

        // Set initial state
        if (this.isCollapsed) { collapseHud() }

        // Add event listeners
        // When the 'Collapse HUD' button is clicked...
        elements.collapseHudButton.on('click', collapseHud)

        // When the 'Expand HUD' Button is clicked...
        elements.expandHudButton.on('click', expandHud)

        // When the 'Expand HUD' button is clicked and held...
        elements.expandHudButton.on('mousedown', this._dragEvent)
        elements.expandHudButton.get(0).addEventListener('touchstart', this._dragEvent, { passive: true })
    }

    /**
     * Drag event handler
     * @private
     * @param {object} event The event
     */
    _dragEvent (event) {
        if (!this.isDraggable) return

        // Get the main element
        const element = document.getElementById('token-action-hud')

        const clientX = event.clientX ?? event.changedTouches[0].clientX
        const clientY = event.clientY ?? event.changedTouches[0].clientY

        // Initialise positions and starting positions
        let pos1 = 0
        let pos2 = 0
        let pos3 = clientX
        let pos4 = clientY
        const originalElementTop = element.offsetTop
        const originalElementLeft = element.offsetLeft
        let newElementTop = originalElementTop
        let newElementLeft = originalElementLeft

        /**
         * Mouse movement event handler
         * @param {object} event The event
         */
        const mouseMoveEvent = (event) => {
            const clientX = event.clientX ?? event.changedTouches[0].clientX
            const clientY = event.clientY ?? event.changedTouches[0].clientY
            pos1 = pos3 - clientX
            pos2 = pos4 - clientY
            pos3 = clientX
            pos4 = clientY

            // If the mouse has not moved, do not update
            if (pos1 === pos3 && pos2 === pos4) return

            newElementTop = newElementTop - pos2
            newElementLeft = newElementLeft - pos1

            this.topPos = newElementTop

            // Apply styles
            requestAnimationFrame(() => {
                Object.assign(element.style, { left: `${newElementLeft}px`, position: 'fixed', top: `${newElementTop}px` })
            })
        }

        /**
         * Mouse up event handler
         */
        const mouseUpEvent = () => {
            // Remove the mouse move and touch move events
            document.onmousemove = null
            element.ontouchmove = null

            // Remove the mouse up and touch end events
            document.onmouseup = null
            element.ontouchend = null

            // If position has not changed, do not update
            if (newElementTop === originalElementTop && newElementLeft === originalElementLeft) return

            this.topPos = newElementTop

            this.applySettings()

            // Save the new position to the user's flags
            Utils.setUserFlag('position', { top: newElementTop, left: newElementLeft })

            Logger.debug(`Set position to x: ${newElementTop}px, y: ${newElementLeft}px`)
        }

        // Bind mouse move and touch move events
        document.onmousemove = mouseMoveEvent
        element.ontouchmove = mouseMoveEvent

        // Bind mouse up and touch end events
        document.onmouseup = mouseUpEvent
        element.ontouchend = mouseUpEvent
    }

    /**
     * Get the automatic direction the HUD expands
     * @private
     * @returns {string} The direction
     */
    _getAutoDirection () {
        if (this.direction === 'up' || (this.direction === 'auto' && this.topPos > window.innerHeight / 2)) return 'up'
        return 'down'
    }

    /**
     * Apply settings
     * @public
     */
    applySettings () {
        this.autoDirection = this._getAutoDirection()
        if (this.autoDirection === 'up') {
            $(document).find('.tah-groups-container').removeClass('expand-down')
            $(document).find('.tah-groups-container').addClass('expand-up')
            $(document).find('.tah-groups-container').removeClass('expand-down')
            $(document).find('.tah-groups-container').addClass('expand-up')
            $(document).find('#tah-character-name').addClass('tah-hidden')
        } else {
            $(document).find('.tah-groups-container').addClass('expand-down')
            $(document).find('.tah-groups-container').removeClass('expand-up')
            $(document).find('.tah-groups-container').addClass('expand-down')
            $(document).find('.tah-groups-container').removeClass('expand-up')
            $(document).find('#tah-character-name').removeClass('tah-hidden')
        }
    }

    /**
     * Set position of the HUD
     * @public
     */
    setPosition () {
        if (!this.hud) return

        const hudTitle = $(document).find('#tah-character-name')
        if (hudTitle.length > 0) { hudTitle.css('top', -hudTitle[0].getBoundingClientRect().height) }

        const token = canvas?.tokens?.placeables.find(
            (t) => t.id === this.hud?.tokenId
        )
        this._setPositionFromFlag()
        this._restoreHoveredGroups()
        this.rendering = false
    }

    /**
     * Set the position of the HUD based on user flag
     * @private
     */
    _setPositionFromFlag () {
        const pos = Utils.getUserFlag('position')

        if (!pos) return

        const defaultLeftPos = this.defaultLeftPos
        const defaultTopPos = this.defaultTopPos

        return new Promise((resolve) => {
            const check = () => {
                const element = document.getElementById('token-action-hud')
                if (element) {
                    element.style.bottom = null
                    this.topPos = pos.top < 5 || pos.top > window.innerHeight + 5
                        ? defaultTopPos
                        : pos.top
                    element.style.top = `${this.topPos}px`
                    this.leftPos = pos.left < 5 || pos.left > window.innerWidth + 5
                        ? defaultLeftPos
                        : pos.left
                    element.style.left = `${this.leftPos}px`
                    element.style.position = 'fixed'
                    resolve()
                } else {
                    setTimeout(check, 30)
                }
            }

            check()
        })
    }

    /**
     * Set the position of the HUD based on the controlled token
     * @private
     * @param {object} token
     */
    _setPositionFromToken (token) {
        return new Promise((resolve) => {
            function check (token) {
                const element = $('#token-action-hud')
                if (element) {
                    element.css('bottom', null)
                    element.css(
                        'left',
                        token.worldTransform.tx +
                        (token.width * canvas.dimensions.size + 55) *
                        canvas.scene._viewPosition.scale + 'px'
                    )
                    element.css('top', token.worldTransform.ty + 0 + 'px')
                    element.css('position', 'fixed')
                    resolve()
                } else {
                    setTimeout(check, 30)
                }
            }

            check(token)
        })
    }

    /**
     * Reset the position of the HUD
     * @public
     */
    async resetPosition () {
        Logger.debug('Resetting position...')
        await Utils.setUserFlag('position', { top: this.defaultTopPos, left: this.defaultLeftPos })
        Logger.debug(`Position reset to x: ${this.defaultTopPos}px, y: ${this.defaultLeftPos}px`)
    }

    /**
     * Set hovered group
     * @private
     * @param {string} groupId The group id
     */
    _setHoveredGroup (groupId) {
        if (this.hoveredGroups.length > 10) { this.hoveredGroups = [] }
        this.hoveredGroups.push(groupId)
    }

    /**
     * Clear hovered group
     * @private
     * @param {string} groupId The group id
     */
    _clearHoveredGroup (groupId) {
        this.hoveredGroups = this.hoveredGroups.filter(id => id !== groupId)
    }

    /**
     * Restore the hovered category state on the HUD
     * @private
     */
    _restoreHoveredGroups () {
        if (!this.hoveredGroups.length) return

        for (const groupId of this.hoveredGroups) {
            const groupElement = $(`#${groupId}`)

            if (!groupElement[0]) continue

            if (this.isClickOpen) {
                const button = groupElement.find('.tah-group-button')[0]
                button.click()
            } else {
                groupElement.mouseenter()
            }
        }
    }

    /**
     * Toggle HUD
     * @public
     */
    async toggleHud () {
        const binding = Utils.humanizeBinding('toggleHud')
        if (this.isEnabled) {
            this.close()
            this.isEnabled = false
            await Utils.setSetting('enable', false)
            Logger.info(game.i18n.format('tokenActionHud.settings.toggleHud.disabled', { binding }), true)
        } else {
            this.isEnabled = true
            await Utils.setSetting('enable', true)
            Logger.info(game.i18n.format('tokenActionHud.settings.toggleHud.enabled', { binding }), true)
            Hooks.callAll('forceUpdateTokenActionHud')
        }
    }

    /**
     * Copy user's 'groups' flag to others users
     * @public
     * @param {string} fromUserId      The user id to copy from
     * @param {string|array} toUserIds The user ids to copy to
     */
    async copy (fromUserId, toUserIds) {
        const isCopied = await this._copyUserData(fromUserId, toUserIds)
        if (isCopied) {
            Logger.info('HUD copied', true)
        } else {
            Logger.info('Copy HUD failed', true)
        }
    }

    /**
     * Copy user's 'groups' flag to others users
     * @private
     * @param {string} fromUserId      The user id to copy from
     * @param {string|array} toUserIds The user ids to copy to
     */
    async _copyUserData (fromUserId, toUserIds) {
        // Exit if parameters are missing
        if (!fromUserId || !toUserIds.length) return false

        Logger.debug('Copying user data...')

        const fromGroup = await game.tokenActionHud.socket.executeAsGM('getData', 'user', fromUserId)

        if (typeof toUserIds === 'string') {
            await game.tokenActionHud.socket.executeAsGM('saveData', 'user', toUserIds, fromGroup)
        } else if (Array.isArray(toUserIds)) {
            for (const userId of toUserIds) {
                await game.tokenActionHud.socket.executeAsGM('saveData', 'user', userId, fromGroup)
            }
        }

        Logger.debug('User data copied')
        return true
    }

    /**
     * Reset the HUD
     * @public
     */
    async reset () {
        await this.resetUserData()
        this.resetPosition()
        Logger.info('HUD reset', true)
    }

    /**
     * Reset actor data
     */
    async resetActorData () {
        Logger.debug('Resetting actor data...')

        await game.tokenActionHud.socket.executeAsGM('saveData', 'actor', this.actor.id, {})

        Logger.debug('Actor data reset')

        const trigger = { trigger: { type: 'method', name: 'TokenActionHud#resetActorData' } }
        this.update(trigger)
    }

    /**
     * Reset all actor data
     * @public
     */
    async resetAllActorData () {
        Logger.debug('Resetting all actor data...')

        for (const actor of game.actors) {
            Logger.debug(`Resetting flags for actor [${actor.id}]`, { actor })
            await game.tokenActionHud.socket.executeAsGM('saveData', 'actor', actor.id, {})
        }
        Logger.debug('All actor data reset')

        const trigger = { trigger: { type: 'method', name: 'TokenActionHud#resetAllActorData' } }
        this.update(trigger)
    }

    /**
     * Reset user data
     * @public
     */
    async resetUserData () {
        Logger.debug('Resetting user data...')
        await game.tokenActionHud.socket.executeAsGM('saveData', 'user', game.userId, {})
        Logger.debug('User data reset')
        this.actionHandler.resetActionHandler()
        const trigger = { trigger: { type: 'method', name: 'TokenActionHud#resetUserData' } }
        this.update(trigger)
    }

    /**
     * Reset all user data
     * @public
     */
    async resetAllUserData () {
        Logger.debug('Resetting all user data...')
        for (const user of game.users) {
            await game.tokenActionHud.socket.executeAsGM('saveData', 'user', user.id, {})
        }
        Logger.debug('All user data reset')
        this.actionHandler.resetActionHandler()
        const trigger = { trigger: { type: 'method', name: 'TokenActionHud#resetAllUserData' } }
        this.update(trigger)
    }

    /**
     * Update the HUD
     * @public
     * @param {object} trigger The trigger for the update
     */
    update (trigger = null) {
        this._updateHud(trigger)
    }

    /**
     * Update the HUD
     * @private
     * @param {object} trigger The trigger for the update
     */
    async _updateHud (trigger) {
        if (this.isUpdating) return
        if (this.isUpdatePending) await this.updateTimer.abort()
        this.isUpdatePending = true
        await this.updateTimer.start()
        this.isUpdatePending = false
        this.isUpdating = true
        Logger.debug('Updating hud...', trigger)

        const previousActorId = this.actor?.id
        const controlledTokens = Utils.getControlledTokens()
        const character = this._getCharacter(controlledTokens)

        const multipleTokens = controlledTokens.length > 1 && !character

        if ((!character && !multipleTokens) || !this.isHudEnabled) {
            this.close()
            this.hoveredGroups = []
            Logger.debug('Hud update aborted as no character(s) found or hud is disabled')
            this.isUpdating = false
            return
        }

        const options = (trigger === 'controlToken' && previousActorId !== this.actor?.id) ? { saveActor: true } : {}

        this.hud = await this.actionHandler.buildHud(options)

        if (this.hud.length === 0) {
            this.close()
            this.hoveredGroups = []
            Logger.debug('Hud update aborted as action list empty')
            this.isUpdating = false
            return
        }

        this.rendering = true
        this.render(true)
        this.isUpdating = false

        Hooks.callAll('tokenActionHudCoreHudUpdated', this.module)
        Logger.debug('Hud updated')
    }

    /**
     * Whether the token change is valid for a HUD update
     * @public
     * @param {object} token The token
     * @param {object} data  The data
     * @returns {boolean}    Whether the token change is valid for a HUD update
     */
    isValidTokenChange (token, data = null) {
        if (data?.actorData?.flags) return false
        if (this.isAlwaysShow) {
            return (this._isRelevantToken(token) || token.actorId === game.user.character?.id)
        } else {
            return this._isRelevantToken(token)
        }
    }

    /**
     * Whether the token is controlled or on the canvas
     * @private
     * @param {object} token The token
     * @returns {boolean} Whether the token is controlled or on the canvas
     */
    _isRelevantToken (token) {
        const controlledTokens = Utils.getControlledTokens()
        return (
            controlledTokens?.some((controlledToken) => controlledToken.id === token.id) ||
            (
                controlledTokens?.length === 0 &&
                canvas?.tokens?.placeables?.some((token) => token.id === this.hud?.tokenId)
            )
        )
    }

    /**
     * Whether the actor or item update is valid for a HUD update
     * @param {object} actor The actor
     * @param {object} data  The data
     * @returns {boolean}    Whether the actor or item update is valid for a HUD update
     */
    isValidActorOrItemUpdate (actor, data) {
        if (data?.flags) {
            Logger.debug('Flags set, do not update hud', { actor, data })
            return false
        }

        if (actor) {
            if (!actor) {
                Logger.debug('No actor, update hud', { data })
                return true
            }

            if (this.hud && actor.id === this.hud.actorId) {
                Logger.debug('Same actor, update hud', { actor, data })
                return true
            }

            Logger.debug('Different actor, do not update hud', { actor, data })
            return false
        }
    }

    /**
     * Whether the hud is enabled for the current user
     * @private
     * @returns {boolean} Whether the hud is enabled for the current user
     */
    _getHudEnabled () {
        const userRole = game.user.role
        const isGM = game.user.isGM
        const isEnabled = Utils.getSetting('enable')

        if (!isEnabled) return false

        if (isGM) return true

        return Utils.checkAllow(userRole)
    }

    /**
     * Whether the compendium is linked
     * @public
     * @param {string} id The compendium id
     * @returns {boolean} Whether the compendium is linked
     */
    isLinkedCompendium (id) {
        Logger.debug('Compendium hook triggered, checking if compendium is linked...')
        return this.actionHandler.isLinkedCompendium(id)
    }

    /**
     * Get character from selected tokens
     * @private
     * @param {array} [controlled = []] The controlled tokens
     */
    _getCharacter (controlled = []) {
        if (controlled.length > 1) {
            this.actor = null
            this.token = null
            this.actionHandler.characterName = 'Multiple'
            this.actionHandler.actor = null
            this.actionHandler.token = null
            this.rollHandler.actor = null
            this.rollHandler.token = null
            return null
        }

        const character = { token: null, actor: null }
        if (controlled.length === 1) {
            const token = controlled[0]
            const actor = token.actor

            if (!this._isValidCharacter(token)) return null

            character.token = token
            character.actor = actor
        } else if (controlled.length === 0 && game.user.character && this.isAlwaysShow) {
            character.actor = game.user.character
            character.token = canvas.tokens.placeables.find(t => t.actor?.id === character.actor.id)
        }

        if (!character.actor) return null

        this.actor = character.actor
        this.token = character.token
        this.actionHandler.characterName = character.token?.name ?? character.actor.name
        this.actionHandler.actor = character.actor
        this.actionHandler.token = character.token
        this.rollHandler.actor = character.actor
        this.rollHandler.token = character.token
        return character
    }

    /**
     * Whether the character is a valid selection for the current user
     * @private
     * @param {object} [token = {}] The token
     * @returns {boolean}           Whether the character is a valid selection for the current user
     */
    _isValidCharacter (token = {}) {
        const actor = token?.actor
        const user = game.user
        return game.user.isGM || actor?.testUserPermission(user, 'OWNER')
    }
}
