// Echo the arguments this process received, one JSON array entry per argv slot.
process.stdout.write(JSON.stringify(process.argv.slice(2)));
