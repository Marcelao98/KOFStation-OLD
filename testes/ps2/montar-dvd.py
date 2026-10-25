#!/usr/bin/env python3
"""Monta um "DVD de PS2" de teste a partir de um .elf LIVRE (ex.: os exemplos do ps2sdk, samples/draw/cube): ISO 9660 com
SYSTEM.CNF dizendo BOOT2 = cdrom0:\\JOGO.ELF;1, que é o que o Play! (e o app, pra saber que é PS2) procuram.
  python3 testes/ps2/montar-dvd.py cube.elf "Cubo PS2.iso"      (precisa: pip install pycdlib)"""
import io, sys
import pycdlib

elf, saida = sys.argv[1], sys.argv[2]
iso = pycdlib.PyCdlib()
iso.new(interchange_level=1, sys_ident="PLAYSTATION", vol_ident="KOFTESTE")
cnf = b"BOOT2 = cdrom0:\\JOGO.ELF;1\r\nVER = 1.00\r\nVMODE = NTSC\r\n"
iso.add_fp(io.BytesIO(cnf), len(cnf), "/SYSTEM.CNF;1")
dados = open(elf, "rb").read()
iso.add_fp(io.BytesIO(dados), len(dados), "/JOGO.ELF;1")
iso.write(saida)
iso.close()
print(saida)
