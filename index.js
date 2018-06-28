#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const { join } = require('path');

const program = require('commander');
const Moment = require('moment-timezone');
const MomentRange = require('moment-range');
const moment = MomentRange.extendMoment(Moment);
const chalk = require('chalk');
const pad = require('pad');

const log = console.log;
const error = console.error;

const homedir = require('os').homedir();
const storePath = join(homedir, 'another-day');

class Iterator {
    constructor(elements) {
        this.elements = elements;
        this.index = 0;
    }

    [Symbol.iterator]() {
        return {
            next: () => {
                if (this.index < this.elements.length) {
                    return { value: this.elements[this.index++], done: false };
                } else {
                    this.index = 0;
                    return { done: true };
                }
            }
        };
    }

    peek() {
        return this.elements[this.index];
    }
}

function checkDirectory(path) {
    return new Promise((resolve, reject) => {
        fs.stat(storePath, (err) => {
            if (err && err.errno === -2) {
                fs.mkdir(storePath, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            } else if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

function writeFile(path, filename, chunk) {
    return new Promise((resolve, reject) => {
        checkDirectory(path)
            .then(() => {
                const fullPath = join(path, filename);
                fs.appendFile(fullPath, chunk, { flag: 'a' }, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            })
            .catch((err) => {
                reject(err);
            });
    });
}

function readFile(path, filename) {
    return new Promise((resolve, reject) => {
        checkDirectory(path)
            .then(() => {
                const fullPath = join(path, filename);
                fs.readFile(fullPath, 'utf8', (err, data) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(data);
                    }
                });
            })
            .catch((err) => {
                reject(err);
            });
    });
}

program
    .command('task <project> <task>')
    .alias('t')
    .description('Marks the current time as the start of a new task.')
    .option('-v, --verbose', 'Verbose logging')
    .option('-t, --time [start]', 'Start time (e.g. 08:00)')
    .option('-i, --id', 'Task ID in VSTS')
    .action(async (projectArg, taskArg, cmd) => {
        const time = cmd.time ? moment.tz(cmd.time, 'HH:mm:ss', 'Europe/Stockholm') : moment();
        const filename = `${time.format('YYYY-MM-DD')}.txt`;
        const chunk = ['task', time.utc().format('HH:mm:ss'), projectArg, taskArg, cmd.id].join('|') + os.EOL;
        try {
            await writeFile(storePath, filename, chunk);
        } catch (err) {
            if (cmd.verbose) {
                console.error(err);
            }
        }
    });

program
    .command('break')
    .alias('b')
    .description('Sets a break at the current time. The time between a break and a mark will not be included.')
    .option('-v, --verbose', 'Verbose logging')
    .option('-t, --time [end]', 'End time (e.g. 17:00)')
    .action(async (cmd) => {
        const time = cmd.time ? moment.tz(cmd.time, 'HH:mm:ss', 'Europe/Stockholm') : moment();
        const filename = `${time.format('YYYY-MM-DD')}.txt`;
        const chunk = ['break',  time.utc().format('HH:mm:ss')].join('|') + os.EOL;
        try {
            await writeFile(storePath, filename, chunk);
        } catch (err) {
            if (cmd.verbose) {
                console.error(err);
            }
        }
    });

program
    .command('show [start] [end]')
    .alias('s')
    .description('Shows saved records for a date or within an inclusive range of dates.')
    .option('-v, --verbose', 'Verbose logging')
    .action(async (startArg, endArg, cmd) => {
        const startDate = startArg ? moment(startArg) : moment();
        const endDate = endArg ? moment(endArg) : startDate;
        const range = moment.range(startDate, endDate);

        log(chalk.inverse([pad('Time', 8), pad('Project', 16), pad('ID', 9), pad('Task', 64)].join('')));

        for (const day of Array.from(range.by('days')).map(m => m.format('YYYY-MM-DD'))) {
            try {
                const filename = `${day}.txt`;
                const data = await readFile(storePath, filename);
                const entries = new Iterator(data.split(os.EOL));

                log(chalk.cyan(chalk.underline(chalk.bold(day))));

                for (const entry of entries) {
                    const [type, time, project, task, id] = entry.split('|');

                    if (!entry || type === 'break') {
                        continue;
                    }

                    let timestamp = '';
                    const nextEntry = entries.peek();

                    if (nextEntry) {
                        const startTime = moment.utc(day + ' ' + time).tz('Europe/Stockholm');
                        const endTime = moment.utc(day + ' ' + nextEntry.split('|')[1]);
                        const duration = moment.duration(endTime.diff(startTime));
                        const adjusted = Math.max(Math.round(duration.as('hours') * 2) / 2, 0.5);
                        timestamp = adjusted + 'h';
                    } else {
                        timestamp = '~';
                    }

                    log(chalk`{yellow ${pad(timestamp, 8)}}{green ${pad(project, 16)}}{gray ${pad(id, 9)}}{white ${task}}`);
                }
            } catch (err) {
                if (cmd.verbose) {
                    error(err);
                }
                continue;
            }
        }
    });

program.parse(process.argv);