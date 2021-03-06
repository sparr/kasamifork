/**
 * Operation: Haul
 *
 * Used to haul energy (or other type of resource) from one room to another
 *
 * End-condition:
 * - Room reaches lvl x ()
 *
 * Pause-condition:
 * - Structure reaches energy-lvl
 */

import {OperationType} from "../enums/operationtypes";
import {Priority} from "../enums/priority";
import {Role} from "../enums/role";
import {ManagerPriority} from "../managers/_Manager";

import {IOperationData} from "../operations/_OperationData";

import * as OrdersRepository from "../repository/Orders";

import {CreepService} from "../services/Creep";

import {Order} from "../classes/Order";

import * as PathfindingUtilities from "../utilities/Pathfinding";
import * as ProfileUtilities from "../utilities/Profiles";

export enum VictoryCondition {
    RoomLevel = 1,
    Gametime = 2,
}

export class Data implements IOperationData {
    public operationtype: OperationType = OperationType.Haul;
    /** Is the operation currenty active TODO: use this with pauseconditions? */
    public active: boolean = true;
    /** Victory-condition for operation */
    public victoryCondition: VictoryCondition;
    /** Victory-condition value */
    public victoryValue: any;
    /** Room to take energy from */
    public from: string;
    /** Room to provide energy to */
    public to: string;
    /** Amount of resource wanted hauled every tick (decides amount of haulers) */
    public amount: number;
    /** StructureID used for picking up, if not given, storage is used */
    public fromID?: string; // Not implemented, using storage so far
    /** StructureID used for dropping of, if not given, storage is used */
    public toID?: string; // Not implemented, using storage so far
    /** RESOURCE_TYPE or energy if not provided */
    public resourceType?: string; // Not implemented, using energy so far

    public haulersNeeded?: number;
}

export function run(operation: Data, creepService: CreepService, pri: ManagerPriority): void {
    if (pri === ManagerPriority.Low) {
        if (Game.time % 50 === 0) {
            checkHaulerAmount(operation, creepService);
        }
    }
}

export function victoryConditionReached(operation: Data): boolean {
    let toRoom = Game.rooms[operation.to];
    if (!(toRoom instanceof Room)) {
        return false;
    }
    switch (operation.victoryCondition) {
        case VictoryCondition.RoomLevel:
            if (toRoom.controller !== undefined && toRoom.controller.level >= operation.victoryValue) {
                operation.active = false;
                return true;
            }
            break;
        case VictoryCondition.Gametime:
            if (Game.time > operation.victoryValue) {
                operation.active = false;
                return true;
            }
            break;
        default:
            break;
    }
    return false;
}

function checkHaulerAmount(operation: Data, creepService: CreepService) {
    let fromRoom = Game.rooms[operation.from];
    if (!(fromRoom instanceof Room) || fromRoom.storage === undefined) {
        return;
    }

    let maxTier = ProfileUtilities.getMaxTierOffroadHauler(fromRoom.energyCapacityAvailable);

    if (operation.haulersNeeded === undefined) {
        let toRoom = Game.rooms[operation.to];
        let toPos = new RoomPosition(25, 25, operation.to);
        if (toRoom instanceof Room && toRoom.storage !== undefined) {
            toPos = toRoom.storage.pos;
        }
        let distance = PathfindingUtilities.getDistanseBetween(fromRoom.storage.pos, toPos);
        let tiersNeeded = (operation.amount * distance * 2 / 50);
        operation.haulersNeeded = Math.ceil(tiersNeeded / maxTier);
    }

    let current = creepService.getCreeps(Role.OperationHauler, operation.to, operation.from).length;
    let ordered = OrdersRepository.getCreepsInQueue(fromRoom, Role.OperationHauler, operation.to);

    if (current + ordered < operation.haulersNeeded) {
        let order = new Order();
        order.body = ProfileUtilities.getOffroadHaulerBody(maxTier);
        order.priority = Priority.Low;
        order.memory = {role: Role.OperationHauler, target: operation.to, tier: maxTier};

        OrdersRepository.orderCreep(fromRoom, order);
    }

}
