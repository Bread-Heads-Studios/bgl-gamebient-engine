const path = require("path");
const { generateIdl } = require("@metaplex-foundation/shank-js");

const idlDir = path.join(__dirname, "..", "idls");
const binaryInstallDir = path.join(__dirname, "..", ".crates");
const programDir = path.join(__dirname, "..", "programs");

// Generate IDL for bgl-cartridge program
generateIdl({
  generator: "shank",
  programName: "bgl_cartridge_program",
  programId: "CART9hmcuf38a58NCYhRJmtGXJjh16eXmLr9hmhAqPZo",
  idlDir,
  idlName: "bgl_cartridge_program",
  binaryInstallDir,
  programDir: path.join(programDir, "bgl-cartridge"),
});

// Generate IDL for bgl-legit program
generateIdl({
  generator: "shank",
  programName: "bgl_legit_program",
  programId: "LEG1T5rABhAnNFz62E4x2dSMjfsuDQyfc5sZjJi9tCq",
  idlDir,
  idlName: "bgl_legit_program",
  binaryInstallDir,
  programDir: path.join(programDir, "bgl-legit"),
});

// Generate IDL for bgl-ghost program
generateIdl({
  generator: "shank",
  programName: "bgl_ghost_program",
  programId: "GHoSTpSurgVaWBYJXnDZgiMMdKsWxjWmCvtVqE23JiS3",
  idlDir,
  idlName: "bgl_ghost_program",
  binaryInstallDir,
  programDir: path.join(programDir, "bgl-ghost"),
});