function check(value: number | null) {
  if (value == false) {  // 버그 1: == 강제 형변환
    doSomething();
    obj!.method();  // 버그 2: non-null assertion + null obj
  }
}
