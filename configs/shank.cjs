const path = require("path");
const { generateIdl } = require("@metaplex-foundation/shank-js");

const idlDir = path.join(__dirname, "..", "idls");
const binaryInstallDir = path.join(__dirname, "..", ".crates");
const programDir = path.join(__dirname, "..", "programs");

generateIdl({
  generator: "shank",
  programName: "bgl_cartridge_program",
  programId: "CART9hmcuf38a58NCYhRJmtGXJjh16eXmLr9hmhAqPZo",
  idlDir,
  idlName: "bgl_cartridge",
  binaryInstallDir,
  programDir: path.join(programDir, "bgl-cartridge"),
});
