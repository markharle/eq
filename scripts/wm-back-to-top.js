<!-- Scroll To Top Button HTML -->
<button id="wm-back-to-top">
  <div class="btt-background"></div>
  <div class="icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-labelledby="title" role="img" xmlns:xlink="http://www.w3.org/1999/xlink">
      <title>Arrow Up</title>
      <path data-name="layer2" fill="none" stroke="#202020" stroke-miterlimit="10" stroke-width="2" d="M32 10v46" stroke-linejoin="round" stroke-linecap="round"></path>
      <path data-name="layer1" fill="none" stroke="#202020" stroke-miterlimit="10" stroke-width="2" d="M50 20 L32 4 14 20" stroke-linejoin="round" stroke-linecap="round"></path>
    </svg>
  </div>

</button>

<!-- Scroll To Top Button Javascript -->
<script>
(function() {
  let throttlePause;

  document.addEventListener('click', function(e) {
    if (!e.target.closest('#wm-back-to-top')) return;
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  })

  document.addEventListener('DOMContentLoaded', function(){
    let btt = document.querySelector('#wm-back-to-top');
    let body = document.body;
    body.append(btt);
    if (btt?.closest('.sqs-block-content')){
      btt.closest('.sqs-block-content').style.display = 'inline';
    }
  });

  const throttle = (callback, time) => {
    if (throttlePause) return;

    throttlePause = true;
    setTimeout(() => {
      callback();
      throttlePause = false;
    }, time);
  };

  const checkPos = () => {
    let pos = document.documentElement.scrollTop,
        revealHeight = window.innerHeight * 0.15,
        bttButton = document.querySelector('#wm-back-to-top');
    if (pos >= revealHeight) {
      bttButton.classList.add('show');
    } else {
      bttButton.classList.remove('show');
    }
  }

  window.addEventListener("scroll", () => {
    throttle(checkPos, 150);
  });
  window.addEventListener('DOMContentLoaded', checkPos)
}());
</script>
