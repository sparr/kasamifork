import {RoomLevel} from "../enums/roomlevel";

import * as RoomRepository from "../repository/Room";

export function run(creep: Creep) {
    if (creep.memory.sleepUntil !== undefined && creep.memory.sleepUntil > Game.time) {
        return;
    }

    let tankingBuilding = Game.getObjectById(creep.memory.tankingBuilding) as Structure | Resource | null;
    let dropofBuilding = Game.getObjectById(creep.memory.dropofBuilding) as Tower | Spawn | Extension | Lab | Link | null;

    creep.room.memory.basehauler = creep.id;

    if (tankingBuilding === null || (tankingBuilding instanceof StructureStorage && tankingBuilding.store[RESOURCE_ENERGY] === 0) ||
        (tankingBuilding instanceof StructureContainer && tankingBuilding.store[RESOURCE_ENERGY] === 0)) {
        // TODO figure out what this was supposed to do?
        // instead of working, it freezes a creep with null tankingBuilding and set dropofBuilding and nonzero energy
        // if (creep.carry[RESOURCE_ENERGY] > 0) {
        //     creep.stopTanking();
        //     dropofBuilding = null;
        // } else {
            tankingBuilding = findTankingBuilding(creep);
        // }
    }

    if (creep.ticksToLive < 20 && creep.room.storage instanceof StructureStorage) {
        creep.moveTo(creep.room.storage);
        creep.transfer(creep.room.storage, RESOURCE_ENERGY);
        if (creep.carry[RESOURCE_ENERGY] === 0) {
            creep.suicide();
        }
        return;
    }

    if (!creep.isTanking() && creep.carry.energy < 50) {
        creep.startTanking();
        tankingBuilding = findTankingBuilding(creep);
    }

    if (creep.isFinishedTanking()) {
        creep.stopTanking();
        dropofBuilding = null;
    }

    if (dropofBuilding === null ||
    (dropofBuilding instanceof StructureContainer && dropofBuilding.store[RESOURCE_ENERGY] === dropofBuilding.storeCapacity) ||
    (!(dropofBuilding instanceof StructureContainer) && dropofBuilding.energy === dropofBuilding.energyCapacity)) {
        findDropofBuilding(creep);
        dropofBuilding = Game.getObjectById(creep.memory.dropofBuilding) as Tower | Spawn | Extension | Lab | Link | null;
    }

    if (dropofBuilding === null && !creep.isTanking()) {
        if (creep.carry[RESOURCE_ENERGY] < creep.carryCapacity) {
            creep.startTanking();
            tankingBuilding = findTankingBuilding(creep);
        } else {
            parkMe(creep);
            return;
        }
    }

    if (tankingBuilding === null) {
        return;
    }

    if (creep.isTanking()) {
        let response;
        if (tankingBuilding instanceof Resource) {
             response = creep.pickup(tankingBuilding);
        } else {
             response = creep.withdraw(tankingBuilding, RESOURCE_ENERGY);
        }
        if (response === ERR_NOT_IN_RANGE) {
            creep.moveTo(tankingBuilding);
        }
        if (response === ERR_NOT_ENOUGH_RESOURCES) {
            creep.memory.tankingBuilding = undefined;
        } else if (!(tankingBuilding instanceof Resource)) {
            for (let resourceType in creep.carry) {
                if (resourceType !== RESOURCE_ENERGY) {
                    creep.transfer(tankingBuilding, resourceType);
                }
            }
        }
    } else
    if (dropofBuilding !== null) {
        let response = creep.transfer(dropofBuilding, RESOURCE_ENERGY);
        if (response === ERR_NOT_IN_RANGE) {
            creep.moveTo(dropofBuilding);
            transferEnergyToNearbyExtensions(creep);
        } else
        if (response === OK) {
            if (dropofBuilding.structureType === STRUCTURE_TOWER) {
                creep.memory.dropofBuilding = undefined;
            }
            if (creep.carry[RESOURCE_ENERGY] - 50 < dropofBuilding.energyCapacity - dropofBuilding.energy) {
                creep.startTanking();
                creep.moveTo(tankingBuilding);
                return;
            }
            findDropofBuilding(creep, dropofBuilding.id);
            dropofBuilding = Game.getObjectById(creep.memory.dropofBuilding) as Tower | Spawn | Extension | Lab | Link | null;
            if (dropofBuilding !== null) {
                creep.moveTo(dropofBuilding);
            }
        }
    }
}

function parkMe(creep: Creep) {
    if (creep.memory.parkingPos !== undefined && creep.memory.parkingPos.x !== undefined &&
        creep.memory.parkingPos.y !== undefined && creep.memory.parkingPos.roomName !== undefined) {
        let pos = new RoomPosition(creep.memory.parkingPos.x, creep.memory.parkingPos.y, creep.memory.parkingPos.roomName);
        if (creep.pos.x === pos.x && creep.pos.y === pos.y) {
            creep.memory.sleepUntil = Game.time + 5;
            return;
        }
        creep.moveTo(pos);
        return;
    }
    let parkingPos: RoomPosition;
    let basePos = RoomRepository.getBasePosition(creep.room);
    if (basePos !== undefined) {
        parkingPos = new RoomPosition(basePos.x - 2, basePos.y - 1, basePos.roomName);
    } else {
        parkingPos = creep.pos;
    }
    creep.memory.parkingPos = parkingPos;
    creep.moveTo(parkingPos);
}

function transferEnergyToNearbyExtensions(creep: Creep) {
    for (let x of [-1, 0, 1]) {
        for (let y of [-1, 0, 1]) {
            if ((x !== 0 || y !== 0) && creep.pos.x + x > 0 && creep.pos.x + x < 49 && creep.pos.y + y > 0 && creep.pos.y + y < 49) {
                let pos = new RoomPosition(creep.pos.x + x, creep.pos.y + y, creep.pos.roomName);
                let atPos = pos.lookFor(LOOK_STRUCTURES) as Structure[];
                for (let s of atPos) {
                    if ((s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) &&
                    (s as StructureExtension).energy < (s as StructureExtension).energyCapacity) {
                        creep.transfer(s, RESOURCE_ENERGY);
                        return;
                    }
                }
            }
        }
    }
}

function findTankingBuilding(creep: Creep): Structure | Resource | null {
    let dropped: Resource = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {filter: (r: Resource) => r.resourceType === RESOURCE_ENERGY && r.amount >= (creep.carryCapacity / 2)});
    if (dropped !== null && dropped !== undefined && dropped.pos.getRangeTo(creep.pos) < 10) {
        creep.memory.tankingBuilding = dropped.id;
        return dropped;
    } else
    if (creep.room.storage !== undefined && creep.room.storage.store[RESOURCE_ENERGY] < 100000 &&
    creep.room.terminal !== undefined && creep.room.terminal.store[RESOURCE_ENERGY] > 60000) {
        creep.memory.tankingBuilding = creep.room.terminal.id;
        return creep.room.terminal;
    } else
    if (creep.room.storage !== undefined &&
    creep.room.terminal !== undefined && creep.room.terminal.store[RESOURCE_ENERGY] > 150000) {
        creep.memory.tankingBuilding = creep.room.terminal.id;
        return creep.room.terminal;
    } else
    if (creep.room.storage !== undefined && creep.room.storage.store[RESOURCE_ENERGY] < 8000 &&
    creep.room.terminal !== undefined && creep.room.terminal.store[RESOURCE_ENERGY] > 10000) {
        creep.memory.tankingBuilding = creep.room.terminal.id;
        return creep.room.terminal;
    } else
    if (dropped !== null && dropped !== undefined) {
        creep.memory.tankingBuilding = dropped.id;
        return dropped;
    } else
    if (creep.room.storage === undefined || creep.room.storage.store[RESOURCE_ENERGY] === 0) {
        let b = creep.room.getBaseContainer();
        if (b !== undefined && b.store[RESOURCE_ENERGY] > 0) {
            creep.memory.tankingBuilding = b.id;
            return b;
        }
        if (creep.room.terminal !== undefined && creep.room.terminal.store[RESOURCE_ENERGY] > 0) {
            creep.memory.tankingBuilding = creep.room.terminal.id;
            return creep.room.terminal;
        }
        let container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter:
            (s: Structure) => s.structureType === STRUCTURE_CONTAINER && (s as StructureContainer).store[RESOURCE_ENERGY] >= (creep.carryCapacity / 3)}) as StructureContainer;
        if (container !== null && container !== undefined) {
            creep.memory.tankingBuilding = container.id;
            return container;
        }
        if (creep.room.storage === undefined) {
            creep.memory.tankingBuilding = undefined;
            return null;
        }
    }
    creep.memory.tankingBuilding = creep.room.storage.id;
    return creep.room.storage;
}

function findDropofBuilding(creep: Creep, exceptId: string | null = null) {
    // First check if tower is in dire need
    let towers = creep.room.find(FIND_MY_STRUCTURES, {
        filter: (structure: Structure) => (structure instanceof StructureTower) && structure.energy < structure.energyCapacity - 400 && structure.id !== exceptId}) as Tower[];
    if (towers.length > 0) {
        creep.memory.dropofBuilding = towers[0].id;
        return;
    }

    // find an adjacent extension/spawn/lab to drop into
    if (creep.room.energyAvailable < creep.room.energyCapacityAvailable) {
        // Find extensions in range 1 that needs filling
        let close = lookForCloseStructureNeedingEnergy(creep, 1, exceptId);
        if (close !== undefined) {
            creep.memory.dropofBuilding = close.id;
            return;
        }
        // if there's a single step to take that brings us in range of more extension/spawn, take the best one
        let bestDirection = null;
        let bestDirectionCount = 0;
        let bestDirectionStructure: Structure | null = null;
        for (let direction = 1; direction <= 8; direction++) {
            let checkPos = new RoomPosition(creep.pos.x, creep.pos.y, creep.pos.roomName);
            checkPos = checkPos.getPositionInDirection(direction);
            let targets: OwnedStructure[] = checkPos.findInRange(FIND_MY_STRUCTURES, 1, {filter: (s: OwnedStructure) =>
                (s instanceof StructureExtension || s instanceof StructureSpawn) &&
                s.energy < s.energyCapacity,
            });
            if (targets.length > bestDirectionCount) {
                bestDirection = direction;
                bestDirectionCount = targets.length;
                bestDirectionStructure = targets[0];
            }
        }
        if (bestDirection) {
            creep.move(bestDirection);
            creep.memory.dropofBuilding = bestDirectionStructure ? bestDirectionStructure.id : null;
            return;
        }
    }

    let energyLimitForPowerProcessing = 450000;
    if (Memory.settings.powerfocus === true) {
        energyLimitForPowerProcessing = 200000;
    }
    let powerspawn = creep.room.getPowerSpawn();
    if (powerspawn !== undefined && powerspawn.energy < 1000 &&
    creep.room.storage !== undefined && creep.room.storage.store[RESOURCE_ENERGY] > energyLimitForPowerProcessing) {
        creep.memory.dropofBuilding = powerspawn.id;
        return;
    }

    // Else other buildings
    let closestBuildingInNeed = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
        filter: (structure: Structure) => {
            return structure.id !== exceptId && ((structure instanceof StructureTower && structure.energy < structure.energyCapacity - 200) ||
            structure instanceof StructureLab) && structure.energy < structure.energyCapacity;
        },
    }) as Structure;
    if (closestBuildingInNeed !== null) {
        creep.memory.dropofBuilding = closestBuildingInNeed.id;
        return;
    }

    if (creep.room.energyAvailable < creep.room.energyCapacityAvailable) {
        // Else other extensions/spawn
        closestBuildingInNeed = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
            filter: (structure: Structure) => {
                return structure.id !== exceptId && (structure instanceof StructureSpawn ||
                structure instanceof StructureExtension) && structure.energy < structure.energyCapacity;
            },
        }) as Structure;
        if (closestBuildingInNeed !== null) {
            creep.memory.dropofBuilding = closestBuildingInNeed.id;
            return;
        }
    }

    let terminal = creep.room.terminal;
    if (terminal !== undefined && terminal.store[RESOURCE_ENERGY] < 50000 &&
    creep.room.storage !== undefined && creep.room.storage.store[RESOURCE_ENERGY] > 50000) {
        creep.memory.dropofBuilding = terminal.id;
        return;
    }
    if (terminal !== undefined && terminal.store[RESOURCE_ENERGY] < 100000 && RoomRepository.getRoomLevel(creep.room) >= RoomLevel.Town &&
    creep.room.storage !== undefined && creep.room.storage.store[RESOURCE_ENERGY] > 200000) {
        creep.memory.dropofBuilding = terminal.id;
        return;
    }

    let nuker = creep.room.getNuker();
    if (nuker !== undefined && nuker.energy < nuker.energyCapacity &&
    creep.room.storage !== undefined && creep.room.storage.store[RESOURCE_ENERGY] > 150000) {
        creep.memory.dropofBuilding = nuker.id;
        return;
    }

    if (powerspawn !== undefined && powerspawn.energy < powerspawn.energyCapacity - 1000 &&
    creep.room.storage !== undefined && creep.room.storage.store[RESOURCE_ENERGY] > energyLimitForPowerProcessing) {
        creep.memory.dropofBuilding = powerspawn.id;
        return;
    }

    if (creep.room.storage !== undefined && creep.room.terminal !== undefined &&
    creep.room.storage.store[RESOURCE_ENERGY] < 5000 && creep.room.terminal.store[RESOURCE_ENERGY] > 20000) {
        creep.memory.dropofBuilding = creep.room.storage.id;
        return;
    }

    if (creep.room.storage !== undefined && creep.room.terminal !== undefined &&
    creep.room.terminal.store[RESOURCE_ENERGY] > 150000) {
        creep.memory.dropofBuilding = creep.room.storage.id;
        return;
    }

    towers = creep.room.find(FIND_MY_STRUCTURES, {
        filter: (structure: Structure) => (structure instanceof StructureTower) && structure.energy < structure.energyCapacity && structure.id !== exceptId}) as Tower[];
    if (towers.length > 0) {
        creep.memory.dropofBuilding = towers[0].id;
        return;
    }

    if (RoomRepository.getRoomLevel(creep.room) < RoomLevel.AdvancedColony && creep.room.storage !== undefined) {
        let controllerContainer = (creep.room.controller as Controller).getContainer();
        if (controllerContainer !== undefined && controllerContainer.store[RESOURCE_ENERGY] < 1000) {
            creep.memory.dropofBuilding = controllerContainer.id;
            return;
        }
    }

    creep.memory.dropofBuilding = undefined;
}

function lookForCloseStructureNeedingEnergy(creep: Creep, range: number, exceptId: string | null): Structure | undefined {
    for (let x of _.range(-range, range + 1)) {
        for (let y of _.range(-range, range + 1)) {
            if (Math.abs(x) === range || Math.abs(y) === range) {
                if (creep.pos.x + x > 0 && creep.pos.x + x < 49 && creep.pos.y + y > 0 && creep.pos.y + y < 49) {
                    let atPos = (new RoomPosition(creep.pos.x + x, creep.pos.y + y, creep.pos.roomName)).lookFor(LOOK_STRUCTURES) as Structure[];
                    for (let s of atPos) {
                        if ((s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN ||
                        s.structureType === STRUCTURE_LAB)) {
                            let t = s as StructureExtension | StructureSpawn | StructureTower | StructureLab;
                            if (t.energy < t.energyCapacity && t.id !== exceptId) {
                                return t;
                            }
                        }
                    }
                }
            }
        }
    }
}
