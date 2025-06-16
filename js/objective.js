import objective_list_data from '../data/objective_list.js';

export class ObjectiveManager {
    constructor(gameInstance) {
        this.game = gameInstance;
        this.objectives_data = objective_list_data;
        this.current_objective_index = 0;
        this.objective_unloading = false;
        this.objective_interval = 2000;
        this.objective_wait = 3000;
        this.objective_timeout = null;
        this.current_objective_def = null;
    }

    start() {
        this.set_objective(this.game,this.current_objective_index, true);
    }

    check_current_objective(game) {
        if(!game) return;
        if (game.ui.stateManager.getVar('paused') || !this.current_objective_def) {
            this.scheduleNextCheck();
            return;
        }

        const currentTitle = typeof this.current_objective_def.title === 'function' 
                           ? this.current_objective_def.title() 
                           : this.current_objective_def.title;

        if (this.current_objective_def.check(this.game)) {
            console.log(`Objective completed: ${currentTitle}`);
            if (game.ui && typeof game.ui.say === 'function') {
                game.ui.stateManager.objective_completed();
            }
            this.current_objective_index++;

            if (this.current_objective_def.reward) {
                this.game.current_money += this.current_objective_def.reward;
                game.ui.stateManager.setVar('current_money', this.game.current_money,true);
            } else if (this.current_objective_def.ep_reward) {
                this.game.exotic_particles += this.current_objective_def.ep_reward;
                game.ui.stateManager.setVar('exotic_particles', this.game.exotic_particles,true);
            }

            this.set_objective(game,this.current_objective_index);
        } else {
            this.scheduleNextCheck();
        }
    }
    
    scheduleNextCheck() {
        clearTimeout(this.objective_timeout);
        this.objective_timeout = setTimeout(() => this.check_current_objective(), this.objective_interval);
    }

    set_objective(game,objective_index, skip_wait = false) {
        this.current_objective_index = objective_index;
        const wait = skip_wait ? 0 : this.objective_wait;

        const nextObjective = this.objectives_data[this.current_objective_index];

        if (nextObjective) {
            if (!skip_wait) {
                this.objective_unloading = true;
                game.ui.stateManager.objective_unloaded();
            }

            clearTimeout(this.objective_timeout);
            this.objective_timeout = setTimeout(() => {
                this.current_objective_def = nextObjective;
                
                const displayObjective = {
                    ...this.current_objective_def,
                    title: typeof this.current_objective_def.title === 'function' 
                           ? this.current_objective_def.title() 
                           : this.current_objective_def.title
                };
                game.ui.stateManager.handleObjectiveLoaded(game,displayObjective);

                if (this.current_objective_def.start) {
                    this.current_objective_def.start(this.game);
                }
                this.objective_unloading = false;
                this.check_current_objective(game);
            }, wait);
        } else {
            console.log("All objectives completed or objective index out of bounds.");
            this.current_objective_def = { title: "All objectives completed!", reward: 0, check: () => false };
            game.ui.stateManager.objective_loaded({ ...this.current_objective_def });
            clearTimeout(this.objective_timeout);
        }
    }
}
